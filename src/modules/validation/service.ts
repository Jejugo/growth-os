import { newId } from '@/lib/ids'
import { recordDecision } from '@/lib/observability/service'
import {
  findProduct,
  registerIdeaProduct,
  setProductStage,
  createProfile,
  normalizeProductUrl,
  domainOf,
} from '@/modules/products'
import { profileDataSchema } from '@/modules/products/types'
import type { Product, ProductStage } from '@/modules/products/schema'
import { createCampaignWithTheme } from '@/modules/campaigns'
import { createExperimentWithVariants, startExperimentById, listExperimentVariants } from '@/modules/content'
import { insertGrowthEvent } from '@/modules/attribution/repo'
import { inferPositioningFromBrief } from './ai/positioning-from-brief'
import { deriveAngleVariants } from './ai/derive-angles'
import { writeVerdict } from './ai/write-verdict'
import { briefInputSchema, type BriefInput } from './types'
import { evaluateGate, type GateMetrics, type GateThresholds, type ValidationVerdict } from './gate'
import * as repo from './repo'
import type { ProductBrief, Validation } from './schema'

export class InvalidStageTransitionError extends Error {
  constructor(from: string, to: string) {
    super(`Transição de estágio inválida: ${from} → ${to}`)
    this.name = 'InvalidStageTransitionError'
  }
}

export class ValidationStateError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationStateError'
  }
}

// --- Máquina de estados de estágio (única fonte da verdade) ---------------

export const STAGE_TRANSITIONS: Record<ProductStage, ProductStage[]> = {
  idea: ['validating'],
  validating: ['building'],
  building: ['launched'],
  launched: [],
}

export function assertValidStageTransition(from: ProductStage, to: ProductStage): void {
  if (!STAGE_TRANSITIONS[from]?.includes(to)) {
    throw new InvalidStageTransitionError(from, to)
  }
}

/**
 * Único caminho que muda `products.stage`. Grava o histórico ANTES de
 * escrever o novo estágio — mesma ordem de `claimJobRun`, para que um erro
 * no meio deixe rastro em vez de estado mudo.
 */
export async function changeStage(input: {
  productId: string
  fromStage: ProductStage
  toStage: ProductStage
  actor: 'human' | 'system'
  reason: string
  validationId?: string | null
  url?: string | null
  domain?: string | null
}): Promise<void> {
  assertValidStageTransition(input.fromStage, input.toStage)

  await repo.insertStageEvent({
    productId: input.productId,
    fromStage: input.fromStage,
    toStage: input.toStage,
    actor: input.actor,
    reason: input.reason,
    validationId: input.validationId ?? null,
  })

  await setProductStage(input.productId, {
    stage: input.toStage,
    ...(input.url !== undefined ? { url: input.url } : {}),
    ...(input.domain !== undefined ? { domain: input.domain } : {}),
  })

  await recordDecision({
    productId: input.productId,
    actor: input.actor === 'human' ? 'human' : 'validation-engine',
    decision: 'STAGE_CHANGE',
    rationale: `${input.fromStage} → ${input.toStage}: ${input.reason}`,
  })
}

// --- Criação de ideia -------------------------------------------------------

export async function createIdeaProduct(input: {
  name: string
  brief: BriefInput
}): Promise<{ product: Product; brief: ProductBrief }> {
  const parsedBrief = briefInputSchema.parse(input.brief)

  const product = await registerIdeaProduct(input.name)
  const brief = await repo.insertBrief({ productId: product.id, ...parsedBrief })

  const { positioning, callId } = await inferPositioningFromBrief({
    productId: product.id,
    brief,
  })

  await createProfile({
    productId: product.id,
    source: 'human',
    promptVersion: 'validation.positioning-from-brief@1',
    values: {
      productName: positioning.productName,
      oneLiner: positioning.oneLiner,
      primaryProblem: positioning.primaryProblem,
      valueProposition: positioning.valueProposition,
      pricingSummary: positioning.pricingSummary,
      data: profileDataSchema.parse({
        tagline: null,
        targetUsers: positioning.targetUsers,
        industries: positioning.industries,
        useCases: positioning.useCases,
        differentiators: positioning.differentiators,
        ctas: [],
        competitors: positioning.competitors,
        keywords: positioning.keywords,
        objections: positioning.objections,
        contentThemes: positioning.contentThemes,
        pricingTiers: [],
        featuresListed: [],
        integrationsMentioned: [],
        socialProof: [],
      }),
    },
  })

  await recordDecision({
    productId: product.id,
    actor: 'human',
    decision: 'CREATE_IDEA',
    rationale: `Ideia "${product.name}" cadastrada a partir de brief. Hipótese mais arriscada: "${brief.riskiestAssumption}".`,
    aiCallId: callId,
  })

  return { product, brief }
}

// --- Início de validação -----------------------------------------------------

const DEFAULT_WINDOW_DAYS = 14
const DEFAULT_MIN_VISITORS = 300
const DEFAULT_MIN_SIGNUPS = 100
const DEFAULT_MIN_SIGNUP_RATE = 0.04
const DEFAULT_MIN_STRONG_SIGNALS = 5

export async function startValidation(input: {
  productId: string
  landingUrl: string
  windowDays?: number
  minVisitors?: number
  minSignups?: number
  minSignupRate?: number
  minStrongSignals?: number
}): Promise<Validation> {
  const product = await findProduct(input.productId)
  if (!product) throw new ValidationStateError(`Produto ${input.productId} não existe.`)

  // Primeira validação sai de 'idea'; uma nova tentativa (após pivot/kill) sai
  // de 'validating' mesmo — não é uma transição de estágio, é um reinício.
  if (product.stage !== 'idea' && product.stage !== 'validating') {
    throw new InvalidStageTransitionError(product.stage, 'validating')
  }

  const existingRunning = await repo.findRunningValidation(input.productId)
  if (existingRunning) {
    throw new ValidationStateError('Já existe uma validação em andamento para este produto.')
  }

  const brief = await repo.findLatestBrief(input.productId)
  if (!brief) {
    throw new ValidationStateError('Produto não tem brief — não é possível iniciar validação.')
  }

  const url = normalizeProductUrl(input.landingUrl)
  const domain = domainOf(url)

  const { variants, callId: anglesCallId } = await deriveAngleVariants({
    productId: input.productId,
    brief,
  })

  const { campaign, theme } = await createCampaignWithTheme({
    productId: input.productId,
    name: `Validação: ${brief.riskiestAssumption.slice(0, 60)}`,
    bigIdea: brief.solutionSketch,
    hypothesis: brief.riskiestAssumption,
    theme: { name: 'Teste de demanda', description: brief.problem, keywords: [] },
  })

  const { experiment } = await createExperimentWithVariants({
    productId: input.productId,
    campaignId: campaign.id,
    name: `Ângulos de posicionamento — ${product.name}`,
    hypothesis: brief.riskiestAssumption,
    dimension: 'angle',
    primaryMetric: 'signup',
    minSamplePerVariant: 20,
    variants: variants.map((v, i) => ({
      label: String.fromCharCode(65 + i),
      name: v.name,
      description: v.description,
      spec: { positioningAngle: v.positioningAngle },
      isControl: i === 0,
    })),
  })
  await startExperimentById(experiment.id)

  const windowDays = input.windowDays ?? DEFAULT_WINDOW_DAYS
  const minSignupRate = input.minSignupRate ?? DEFAULT_MIN_SIGNUP_RATE

  const validation = await repo.insertValidation({
    productId: input.productId,
    briefId: brief.id,
    campaignId: campaign.id,
    contentThemeId: theme.id,
    experimentId: experiment.id,
    hypothesis: brief.riskiestAssumption,
    landingUrl: url,
    minVisitors: input.minVisitors ?? DEFAULT_MIN_VISITORS,
    minSignups: input.minSignups ?? DEFAULT_MIN_SIGNUPS,
    minSignupRate: minSignupRate.toFixed(4),
    minStrongSignals: input.minStrongSignals ?? DEFAULT_MIN_STRONG_SIGNALS,
    endsAt: new Date(Date.now() + windowDays * 86_400_000),
  })

  if (product.stage === 'idea') {
    await changeStage({
      productId: input.productId,
      fromStage: 'idea',
      toStage: 'validating',
      actor: 'human',
      reason: `Validação iniciada: "${brief.riskiestAssumption}".`,
      validationId: validation.id,
      url,
      domain,
    })
  } else {
    // Reinício: já está em 'validating', só atualiza a landing se mudou.
    await setProductStage(input.productId, { stage: 'validating', url, domain })
  }

  await recordDecision({
    productId: input.productId,
    actor: 'human',
    decision: 'START_VALIDATION',
    rationale:
      `Janela de ${windowDays} dias. Limiares: ${validation.minVisitors} visitantes, ` +
      `${validation.minSignups} inscrições, taxa ${(minSignupRate * 100).toFixed(2)}%, ` +
      `${validation.minStrongSignals} sinais fortes. ${variants.length} ângulos testados.`,
    aiCallId: anglesCallId,
  })

  return validation
}

// --- Conclusão (gate determinístico + redação do veredito) -----------------

export async function concludeValidationById(
  validationId: string,
): Promise<{ verdict: ValidationVerdict } | null> {
  const validation = await repo.findValidation(validationId)
  if (!validation) return null
  // Idempotência: só conclui quem ainda está rodando.
  if (validation.status !== 'running') return null

  const windowStart = validation.startedAt ?? validation.createdAt
  const windowEnd = validation.endsAt ?? new Date()

  const rawMetrics = await repo.getValidationMetrics(validation.productId, windowStart, windowEnd)
  const metrics: GateMetrics = {
    visitors: rawMetrics.visitors,
    signups: rawMetrics.signups,
    strongSignals: rawMetrics.activations + rawMetrics.paid,
  }
  const thresholds: GateThresholds = {
    minVisitors: validation.minVisitors,
    minSignups: validation.minSignups,
    minSignupRate: Number(validation.minSignupRate),
    minStrongSignals: validation.minStrongSignals,
  }

  const result = evaluateGate(metrics, thresholds)

  const brief = await repo.findBriefById(validation.briefId)
  if (!brief) throw new ValidationStateError(`Brief ${validation.briefId} não encontrado.`)

  const angleNames = validation.experimentId
    ? (await listExperimentVariants(validation.experimentId)).map((v) => v.name)
    : []

  const { writeup, callId } = await writeVerdict({
    productId: validation.productId,
    brief,
    result,
    metrics,
    thresholds,
    angleNames,
  })

  // O LLM só narra: só guardamos pivôs quando o veredito calculado for pivot,
  // independentemente do que o modelo tenha devolvido.
  const pivotSuggestions = result.verdict === 'pivot' ? writeup.pivotSuggestions : []

  await repo.concludeValidation(validation.id, {
    verdict: result.verdict,
    verdictReason: writeup.verdictReason,
    pivotSuggestions,
    aiCallId: callId,
  })

  if (result.verdict === 'build') {
    await changeStage({
      productId: validation.productId,
      fromStage: 'validating',
      toStage: 'building',
      actor: 'system',
      reason: `Validação concluída com veredito "build". ${writeup.verdictReason}`,
      validationId: validation.id,
    })
  }
  // pivot / kill / inconclusive: o produto permanece em 'validating'. Um
  // 'kill' é terminal na prática (ver UI da timeline), mas não é uma
  // transição de estágio — o histórico dessa decisão vive em `validations`.

  await recordDecision({
    productId: validation.productId,
    actor: 'validation-engine',
    decision: `VALIDATION_${result.verdict.toUpperCase()}`,
    rationale: writeup.verdictReason,
    aiCallId: callId,
  })

  return { verdict: result.verdict }
}

export async function abortRunningValidation(productId: string, reason: string): Promise<void> {
  const running = await repo.findRunningValidation(productId)
  if (!running) throw new ValidationStateError('Não há validação em andamento para abortar.')

  await repo.abortValidation(running.id)
  await recordDecision({
    productId,
    actor: 'human',
    decision: 'ABORT_VALIDATION',
    rationale: reason,
  })
}

// --- Lançamento manual -------------------------------------------------------

export async function markLaunched(productId: string): Promise<void> {
  const product = await findProduct(productId)
  if (!product) throw new ValidationStateError(`Produto ${productId} não existe.`)

  await changeStage({
    productId,
    fromStage: product.stage,
    toStage: 'launched',
    actor: 'human',
    reason: 'Produto marcado como lançado manualmente — fora do alcance deste sistema saber quando o código está pronto.',
  })
}

// --- Sinais fortes registrados à mão ----------------------------------------

export async function recordManualSignal(input: {
  productId: string
  kind: 'activation' | 'paid'
  note?: string
  value?: number
}): Promise<void> {
  await insertGrowthEvent({
    productId: input.productId,
    visitorId: null,
    externalUserId: null,
    eventType: input.kind,
    campaignId: null,
    postId: null,
    publicationId: null,
    trackingLinkId: null,
    audienceSegmentId: null,
    channel: 'manual',
    value: input.value != null ? String(input.value) : null,
    attributionModel: 'none',
    metadata: input.note ? { note: input.note } : {},
    occurredAt: new Date(),
    dedupeKey: newId(),
  })
}

// --- Reexports de leitura ----------------------------------------------------

export {
  findLatestBrief,
  findBriefById,
  listValidations,
  findRunningValidation,
  findValidation,
  findDueValidations,
  listStageEvents,
  getValidationMetrics,
  getVariantPerformance,
} from './repo'
