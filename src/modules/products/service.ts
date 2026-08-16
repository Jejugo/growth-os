import { newId } from '@/lib/ids'
import { recordDecision } from '@/lib/observability/service'
import { crawlProductSite, type CrawlResult } from './crawler'
import { extractProductFacts, inferPositioning, POSITIONING_PROMPT_VERSION } from './ai/analyze-product'
import * as repo from './repo'
import { normalizeProductUrl, domainOf, InvalidUrlError } from './url'
import {
  COLUMN_FIELDS,
  isEditableField,
  profileDataSchema,
  type ColumnField,
  type EditableField,
  type ProductFacts,
  type ProductPositioning,
  type ProfileData,
} from './types'
import type { Product, ProductProfile } from './schema'

export class ProductAlreadyExistsError extends Error {
  constructor(readonly productId: string, domain: string) {
    super(`Já existe um produto para o domínio ${domain}.`)
    this.name = 'ProductAlreadyExistsError'
  }
}

// --- valores de perfil (forma pura, testável sem banco) ------------------

export interface ProfileValues {
  productName: string | null
  oneLiner: string | null
  primaryProblem: string | null
  valueProposition: string | null
  pricingSummary: string | null
  data: ProfileData
}

const EMPTY_DATA: ProfileData = {
  tagline: null,
  targetUsers: [],
  industries: [],
  useCases: [],
  differentiators: [],
  ctas: [],
  competitors: [],
  keywords: [],
  objections: [],
  contentThemes: [],
  pricingTiers: [],
  featuresListed: [],
  integrationsMentioned: [],
  socialProof: [],
}

export function buildAiValues(facts: ProductFacts, positioning: ProductPositioning): ProfileValues {
  return {
    productName: facts.productName,
    oneLiner: positioning.oneLiner,
    primaryProblem: positioning.primaryProblem,
    valueProposition: positioning.valueProposition,
    pricingSummary: facts.pricingSummary,
    data: profileDataSchema.parse({
      tagline: facts.tagline,
      targetUsers: positioning.targetUsers,
      industries: positioning.industries,
      useCases: positioning.useCases,
      differentiators: positioning.differentiators,
      ctas: facts.ctas,
      competitors: positioning.competitors,
      keywords: positioning.keywords,
      objections: positioning.objections,
      contentThemes: positioning.contentThemes,
      pricingTiers: facts.pricingTiers,
      featuresListed: facts.featuresListed,
      integrationsMentioned: facts.integrationsMentioned,
      socialProof: facts.socialProof,
    }),
  }
}

function readField(values: ProfileValues, field: EditableField): unknown {
  return (COLUMN_FIELDS as readonly string[]).includes(field)
    ? values[field as ColumnField]
    : values.data[field as keyof ProfileData]
}

function writeField(values: ProfileValues, field: EditableField, value: unknown): ProfileValues {
  if ((COLUMN_FIELDS as readonly string[]).includes(field)) {
    return { ...values, [field as ColumnField]: value as string | null }
  }
  return { ...values, data: { ...values.data, [field]: value } as ProfileData }
}

/**
 * O ponto delicado da Fase 0: uma nova análise NUNCA sobrescreve o que o
 * humano editou. Campos em `lockedFields` mantêm o valor atual; o resto vem
 * da IA. A versão resultante é `merged` quando há qualquer campo travado.
 */
export function mergeProfile(
  incoming: ProfileValues,
  current: (ProfileValues & { lockedFields: string[] }) | null,
): { values: ProfileValues; lockedFields: string[]; source: 'ai' | 'merged' } {
  if (!current || current.lockedFields.length === 0) {
    return { values: incoming, lockedFields: current?.lockedFields ?? [], source: 'ai' }
  }

  const locked = current.lockedFields.filter(isEditableField)
  let merged = incoming
  for (const field of locked) {
    merged = writeField(merged, field, readField(current, field))
  }

  return { values: merged, lockedFields: locked, source: 'merged' }
}

export function toProfileValues(profile: ProductProfile): ProfileValues & { lockedFields: string[] } {
  return {
    productName: profile.productName,
    oneLiner: profile.oneLiner,
    primaryProblem: profile.primaryProblem,
    valueProposition: profile.valueProposition,
    pricingSummary: profile.pricingSummary,
    data: profile.data,
    lockedFields: profile.lockedFields,
  }
}

// --- casos de uso --------------------------------------------------------

export async function registerProduct(rawUrl: string): Promise<Product> {
  const url = normalizeProductUrl(rawUrl)
  const domain = domainOf(url)

  const existing = await repo.findProductByDomain(domain)
  if (existing) throw new ProductAlreadyExistsError(existing.id, domain)

  return repo.insertProduct({ name: domain, url, domain })
}

export interface AnalysisOutcome {
  status: 'analyzed' | 'unchanged'
  profileId?: string
  version?: number
  costUsd: number
  pagesRead: number
  skipped: CrawlResult['skipped']
}

/**
 * Pipeline completo: crawl → extração factual → inferência → merge → versão.
 *
 * Todas as escritas de perfil acontecem no fim. Este é o único job do sistema
 * em que retry cego é aceitável, justamente porque nada sai para fora.
 */
export async function analyzeProduct(input: {
  productId: string
  force?: boolean
  jobRunId?: string
}): Promise<AnalysisOutcome> {
  const product = await repo.findProduct(input.productId)
  if (!product) throw new InvalidUrlError(`Produto ${input.productId} não existe.`)

  await repo.setAnalysisStatus(product.id, 'running')

  try {
    const crawlBatchId = newId()
    const crawl = await crawlProductSite(product.url)
    const { insertedCount } = await repo.saveSnapshots(product.id, crawlBatchId, crawl.pages)

    const current = await repo.getCurrentProfile(product.id)

    // Nada mudou no site e já existe perfil: não gasta token nenhum.
    if (insertedCount === 0 && current && !input.force) {
      await repo.setAnalysisStatus(product.id, 'ok')
      await recordDecision({
        productId: product.id,
        actor: 'product-analyst',
        decision: 'NO_ACTION',
        rationale:
          'Conteúdo do site idêntico ao último crawl e já existe perfil corrente. ' +
          'Nova versão não foi criada e nenhuma chamada de LLM foi feita.',
        inputsSnapshot: { crawlBatchId, pagesRead: crawl.pages.length },
        jobRunId: input.jobRunId,
      })
      return {
        status: 'unchanged',
        costUsd: 0,
        pagesRead: crawl.pages.length,
        skipped: crawl.skipped,
      }
    }

    const { facts, costUsd: extractCost } = await extractProductFacts({
      productId: product.id,
      pages: crawl.pages,
    })

    const { positioning, callId, costUsd: positioningCost } = await inferPositioning({
      productId: product.id,
      url: product.url,
      facts,
      pageRoles: crawl.pages.map((p) => p.pageRole),
    })

    const incoming = buildAiValues(facts, positioning)
    const merged = mergeProfile(incoming, current ? toProfileValues(current) : null)

    const weakConfidence = Object.values(positioning.confidence).some((v) => v < 0.4)

    const profile = await repo.insertProfileVersion({
      productId: product.id,
      source: merged.source,
      promptVersion: POSITIONING_PROMPT_VERSION,
      crawlBatchId,
      ...merged.values,
      lockedFields: merged.lockedFields,
      confidence: positioning.confidence,
      lowConfidence: crawl.lowContent || weakConfidence,
    })

    await repo.setAnalysisStatus(product.id, 'ok')

    await recordDecision({
      productId: product.id,
      actor: 'product-analyst',
      decision: 'PROFILE_UPDATED',
      rationale:
        `Perfil v${profile.version} criado como '${merged.source}'. ` +
        `${crawl.pages.length} páginas lidas, ${merged.lockedFields.length} campos preservados por edição humana.` +
        (crawl.lowContent ? ' HTML quase vazio — provável SPA sem SSR.' : ''),
      inputsSnapshot: {
        crawlBatchId,
        pages: crawl.pages.map((p) => ({ url: p.pageUrl, role: p.pageRole })),
        lockedFields: merged.lockedFields,
        confidence: positioning.confidence,
      },
      aiCallId: callId,
      jobRunId: input.jobRunId,
    })

    return {
      status: 'analyzed',
      profileId: profile.id,
      version: profile.version,
      costUsd: extractCost + positioningCost,
      pagesRead: crawl.pages.length,
      skipped: crawl.skipped,
    }
  } catch (error) {
    await repo.setAnalysisStatus(
      product.id,
      'failed',
      error instanceof Error ? error.message : String(error),
    )
    throw error
  }
}

/**
 * Edição humana. O campo passa a integrar `lockedFields` e deixa de ser
 * sobrescrito por análises futuras, até que seja destravado explicitamente.
 */
export async function editProfileField(input: {
  productId: string
  field: string
  value: unknown
}): Promise<ProductProfile> {
  if (!isEditableField(input.field)) {
    throw new InvalidUrlError(`Campo não editável: ${input.field}`)
  }

  const current = await repo.getCurrentProfile(input.productId)
  if (!current) throw new InvalidUrlError('Produto ainda não tem perfil para editar.')

  const values = writeField(toProfileValues(current), input.field, input.value)
  const lockedFields = [...new Set([...current.lockedFields, input.field])]

  const profile = await repo.insertProfileVersion({
    productId: input.productId,
    source: 'human',
    promptVersion: current.promptVersion,
    crawlBatchId: current.crawlBatchId,
    productName: values.productName,
    oneLiner: values.oneLiner,
    primaryProblem: values.primaryProblem,
    valueProposition: values.valueProposition,
    pricingSummary: values.pricingSummary,
    data: profileDataSchema.parse(values.data),
    lockedFields,
    confidence: current.confidence,
    lowConfidence: current.lowConfidence,
  })

  await recordDecision({
    productId: input.productId,
    actor: 'human',
    decision: 'PROFILE_FIELD_EDITED',
    rationale: `Campo '${input.field}' editado manualmente e travado contra sobrescrita da IA.`,
    inputsSnapshot: { field: input.field, version: profile.version },
  })

  return profile
}

/** Destrava um campo para que a próxima análise volte a preenchê-lo. */
export async function unlockProfileField(input: {
  productId: string
  field: string
}): Promise<ProductProfile> {
  const current = await repo.getCurrentProfile(input.productId)
  if (!current) throw new InvalidUrlError('Produto ainda não tem perfil.')

  const values = toProfileValues(current)
  const profile = await repo.insertProfileVersion({
    productId: input.productId,
    source: current.source,
    promptVersion: current.promptVersion,
    crawlBatchId: current.crawlBatchId,
    productName: values.productName,
    oneLiner: values.oneLiner,
    primaryProblem: values.primaryProblem,
    valueProposition: values.valueProposition,
    pricingSummary: values.pricingSummary,
    data: values.data,
    lockedFields: current.lockedFields.filter((f) => f !== input.field),
    confidence: current.confidence,
    lowConfidence: current.lowConfidence,
  })

  return profile
}

export { EMPTY_DATA }
