import { newId, shortHash } from '@/lib/ids'
import { env } from '@/lib/env'
import { recordDecision } from '@/lib/observability/service'
import {
  findProduct,
  registerIdeaProduct,
  setProductStage,
  createProfile,
  getCurrentProfile,
  normalizeProductUrl,
  domainOf,
} from '@/modules/products'
import { profileDataSchema } from '@/modules/products/types'
import type { Product, ProductStage } from '@/modules/products/schema'
import { createCampaignWithTheme } from '@/modules/campaigns'
import {
  createExperimentWithVariants,
  startExperimentById,
  listExperimentVariants,
  findPost,
  recentPostsMemory,
  type RiskReview,
  type SocialPost,
} from '@/modules/content'
import * as contentRepo from '@/modules/content/repo'
import { prepareFingerprint } from '@/modules/content/dedupe'
import { reviewRisk } from '@/modules/content/ai/review-risk'
import { insertGrowthEvent } from '@/modules/attribution/repo'
import { inferPositioningFromBrief } from './ai/positioning-from-brief'
import { deriveAngleVariants } from './ai/derive-angles'
import { writeVerdict } from './ai/write-verdict'
import { writeValidationPost } from './ai/write-validation-post'
import { briefInputSchema, type BriefInput } from './types'
import type { PositioningVariant } from './types'
import { evaluateGate, type GateMetrics, type GateThresholds, type ValidationVerdict } from './gate'
import { writeLandingPageCopy } from './landing/ai/write-landing-page'
import type { LandingPageCopy, CustomLandingFile } from './landing/types'
import { reviewLandingPageRisk } from './landing/ai/review-landing-risk'
import { reviseCustomLandingFiles } from './landing/ai/revise-custom-landing'
import { renderLandingPageHtml } from './landing/template'
import { deployLandingFiles } from './landing/deploy'
import * as repo from './repo'
import type { ProductBrief, Validation, LandingPage, LandingPageDraft } from './schema'

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

// --- Reescrita de post sinalizado pelo risk review --------------------------

export class RewriteNotAllowedError extends Error {}

/**
 * Reescreve um post de validação usando o feedback do risk review anterior
 * (`reasons` + `suggestedFix`) como correção. Só se aplica a posts de
 * validação (`variantOf` setado) com veredito "flag" — "block" é sinal mais
 * grave, fica pra revisão humana; "pass" não precisa de reescrita.
 */
export async function rewriteValidationPost(postId: string): Promise<SocialPost> {
  const post = await findPost(postId)
  if (!post) throw new RewriteNotAllowedError(`Post ${postId} não encontrado.`)
  if (!post.variantOf) {
    throw new RewriteNotAllowedError('Este post não pertence a uma validação.')
  }

  const review = post.riskReview as RiskReview | null
  if (!review || review.verdict !== 'flag') {
    throw new RewriteNotAllowedError('Só é possível reformular posts com risk review "flag".')
  }

  const validation = await repo.findValidationByCampaignId(post.campaignId)
  if (!validation || !validation.experimentId) {
    throw new RewriteNotAllowedError('Validação do post não encontrada.')
  }

  const [brief, variants, profile] = await Promise.all([
    repo.findBriefById(validation.briefId),
    listExperimentVariants(validation.experimentId),
    getCurrentProfile(post.productId),
  ])
  if (!brief) throw new RewriteNotAllowedError('Brief da validação não encontrado.')
  if (!profile) throw new RewriteNotAllowedError('Produto sem perfil — impossível revisar risco.')

  const variant = variants.find((v) => v.id === post.variantOf)
  if (!variant) throw new RewriteNotAllowedError('Variante do experimento não encontrada.')

  const spec = variant.spec as { positioningAngle?: string } | null
  const positioningVariant: PositioningVariant = {
    name: variant.name,
    description: variant.description ?? variant.name,
    positioningAngle: spec?.positioningAngle ?? variant.name,
  }

  const feedback = [review.reasons.join(' '), review.suggestedFix ? `Sugestão: ${review.suggestedFix}` : '']
    .filter(Boolean)
    .join(' ')

  const recentPosts = await recentPostsMemory(post.productId, 20)

  const { post: rewritten, costUsd: writeCost } = await writeValidationPost({
    productId: post.productId,
    brief,
    variant: positioningVariant,
    channel: post.channel,
    landingUrl: validation.landingUrl,
    recentPosts: recentPosts.map((p) => ({ hook: p.hook, cta: p.cta })),
    feedback,
  })

  await contentRepo.setPostBody(post.id, {
    hook: rewritten.hook,
    body: rewritten.body,
    cta: rewritten.cta,
  })
  await contentRepo.insertFeedback({
    productId: post.productId,
    postId: post.id,
    action: 'edited',
    editedFrom: `hook: "${post.hook}"`,
    editedTo: `hook: "${rewritten.hook}" (reescrito por IA a partir do risk review)`,
  })

  const hookFp = prepareFingerprint(rewritten.hook, 'hook')
  await contentRepo.insertFingerprints([
    { productId: post.productId, postId: post.id, kind: 'hook', ...hookFp },
  ])

  const updated = await findPost(post.id)
  if (!updated) throw new RewriteNotAllowedError('Post sumiu durante a reescrita.')

  const { review: newReview, costUsd: reviewCost } = await reviewRisk({
    productId: post.productId,
    post: updated,
    profile,
    isValidation: true,
  })

  await contentRepo.setPostRiskReview(post.id, newReview)
  await contentRepo.setPostStatus(
    post.id,
    newReview.verdict === 'pass' ? 'approved' : newReview.verdict === 'block' ? 'draft' : 'pending_approval',
  )

  await recordDecision({
    productId: post.productId,
    actor: 'validation-content-writer',
    decision: 'REWRITE_VALIDATION_POST',
    rationale:
      `Post ${post.id} reescrito a partir do risk review anterior ("flag"). ` +
      `Novo veredito: ${newReview.verdict}. Custo: US$ ${(writeCost + reviewCost).toFixed(4)}.`,
  })

  const final = await findPost(post.id)
  if (!final) throw new RewriteNotAllowedError('Post sumiu durante a reescrita.')
  return final
}

// --- Landing page automática -------------------------------------------------

export class LandingGenerationError extends Error {}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // remove acentos
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 30) || 'ideia'
  )
}

/**
 * Cria (ou reaproveita) a linha `landing_pages` com status `generating` — só
 * isso, rápido e síncrono. Separado de `generateLandingPage` de propósito: o
 * dispatcher (`src/server/jobs.ts`) precisa que essa linha já exista no banco
 * ANTES de disparar o trabalho pesado em background, senão o polling da UI
 * corre risco de nunca ver o "generating" (a página busca o estado no mesmo
 * instante em que a action retorna, e o job em background pode não ter
 * escrito nada ainda).
 */
export async function startLandingPageGeneration(productId: string): Promise<LandingPage> {
  const product = await findProduct(productId)
  if (!product) throw new LandingGenerationError(`Produto ${productId} não existe.`)

  const alreadyGenerating = await repo.findGeneratingLandingPage(productId)
  if (alreadyGenerating) return alreadyGenerating

  const slug = `${slugify(product.name)}-lp-${shortHash(productId, 8)}`
  return repo.insertLandingPage({ productId, slug })
}

/**
 * Gera a copy, roda o risk review e publica de verdade uma landing page pro
 * produto — devolve a linha `landing_pages` (ver status: `ready`/`blocked`/
 * `failed`). `slug` deriva do `productId` (estável, não da tentativa), então
 * regenerar reusa o mesmo projeto Vercel em vez de trocar de domínio no meio
 * de uma validação já em andamento.
 *
 * Recebe a linha já criada por `startLandingPageGeneration` — não cria a sua
 * própria, pra não duplicar a checagem de "já tem uma rodando".
 *
 * `adjustment`, quando presente, faz a IA revisar a copy anterior em vez de escrever do zero —
 * ver `dispatchGenerateLandingPage`, que busca essa copy anterior antes de criar a nova linha.
 */
export async function generateLandingPage(
  landingPage: LandingPage,
  adjustment?: { previousCopy: LandingPageCopy; note: string },
): Promise<LandingPage> {
  const { productId, slug } = landingPage

  const [brief, profile] = await Promise.all([
    repo.findLatestBrief(productId),
    getCurrentProfile(productId),
  ])
  if (!brief) throw new LandingGenerationError('Produto sem brief — não é possível gerar landing.')
  if (!profile) throw new LandingGenerationError('Produto sem perfil — não é possível gerar landing.')

  const product = await findProduct(productId)
  if (!product) throw new LandingGenerationError(`Produto ${productId} não existe.`)

  try {
    const { copy, callId: copyCallId, costUsd: copyCost } = await writeLandingPageCopy({
      productId,
      productName: product.name,
      brief,
      profile,
      adjustment,
    })

    const { review, costUsd: reviewCost } = await reviewLandingPageRisk({
      productId,
      productName: product.name,
      copy,
      profile,
    })
    const totalCostUsd = copyCost + reviewCost

    if (review.verdict === 'block') {
      await repo.updateLandingPage(landingPage.id, {
        status: 'blocked',
        copy,
        riskReview: review,
        aiCallId: copyCallId,
        error: review.reasons.join(' '),
      })
      await recordDecision({
        productId,
        actor: 'validation-content-writer',
        decision: 'GENERATE_LANDING_PAGE_BLOCKED',
        rationale: `Landing bloqueada pelo risk review: ${review.reasons.join('; ')}. Custo: US$ ${totalCostUsd.toFixed(4)}.`,
        aiCallId: copyCallId,
      })
      return (await repo.findLandingPage(landingPage.id))!
    }

    const html = renderLandingPageHtml(copy, {
      productName: product.name,
      formActionUrl: `${env().NEXT_PUBLIC_BASE_URL}/api/lp/${productId}/signup`,
    })

    const { url, deploymentId } = await deployLandingFiles([{ file: 'index.html', data: html }], slug)

    await repo.updateLandingPage(landingPage.id, {
      status: 'ready',
      copy,
      html,
      riskReview: review,
      vercelDeploymentId: deploymentId,
      deployUrl: url,
      aiCallId: copyCallId,
    })

    await recordDecision({
      productId,
      actor: 'validation-content-writer',
      decision: 'GENERATE_LANDING_PAGE',
      rationale: adjustment
        ? `Landing revisada a pedido do fundador ("${adjustment.note}") e republicada em ${url}. Veredito do risk review: ${review.verdict}. Custo: US$ ${totalCostUsd.toFixed(4)}.`
        : `Landing gerada e publicada em ${url}. Veredito do risk review: ${review.verdict}. Custo: US$ ${totalCostUsd.toFixed(4)}.`,
      aiCallId: copyCallId,
    })

    return (await repo.findLandingPage(landingPage.id))!
  } catch (error) {
    await repo.updateLandingPage(landingPage.id, {
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

/**
 * Mesmo papel de `startLandingPageGeneration`, mas pro caminho de upload de zip customizado —
 * reusa o mesmo guard `findGeneratingLandingPage` (IA e upload nunca rodam em paralelo pro mesmo
 * produto) e o mesmo slug estável.
 */
export async function startCustomLandingUpload(productId: string): Promise<LandingPage> {
  const product = await findProduct(productId)
  if (!product) throw new LandingGenerationError(`Produto ${productId} não existe.`)

  const alreadyGenerating = await repo.findGeneratingLandingPage(productId)
  if (alreadyGenerating) return alreadyGenerating

  const slug = `${slugify(product.name)}-lp-${shortHash(productId, 8)}`
  return repo.insertLandingPage({ productId, slug, source: 'custom_upload' })
}

/**
 * Publica os arquivos de um upload customizado (já validados por `parseCustomLandingZip`) — sem
 * copy nem risk review, é conteúdo do próprio fundador. Recebe a linha já criada por
 * `startCustomLandingUpload`, mesmo motivo de `generateLandingPage`.
 */
export async function deployCustomLanding(
  landingPage: LandingPage,
  files: CustomLandingFile[],
): Promise<LandingPage> {
  const { id, productId, slug } = landingPage

  try {
    const { url, deploymentId } = await deployLandingFiles(files, slug)

    // `files` fica salvo pra permitir pedir ajuste por IA depois (`reviseCustomLanding`) sem
    // precisar reenviar o zip inteiro de novo.
    await repo.updateLandingPage(id, {
      status: 'ready',
      vercelDeploymentId: deploymentId,
      deployUrl: url,
      files,
    })

    await recordDecision({
      productId,
      actor: 'human',
      decision: 'UPLOAD_CUSTOM_LANDING',
      rationale: `Landing customizada enviada por upload e publicada em ${url} (${files.length} arquivo${files.length === 1 ? '' : 's'}).`,
    })

    return (await repo.findLandingPage(id))!
  } catch (error) {
    await repo.updateLandingPage(id, {
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

/**
 * Cria (ou substitui) o rascunho de landing customizada a partir de um zip recém-validado. Zera o
 * `history` de propósito: reenviar um zip novo troca o código por fora, então pedidos de ajuste
 * anteriores deixam de fazer sentido sobre o conteúdo novo. Não toca na Vercel — o preview lê os
 * arquivos daqui (`/api/landing-drafts`), publicar é uma ação separada (`publishLandingDraft`).
 */
export async function startCustomLandingDraft(
  productId: string,
  files: CustomLandingFile[],
): Promise<LandingPageDraft> {
  const product = await findProduct(productId)
  if (!product) throw new LandingGenerationError(`Produto ${productId} não existe.`)
  return repo.upsertLandingPageDraft(productId, { files, history: [] })
}

/**
 * Pede um ajuste no rascunho — a IA edita os arquivos vendo o histórico inteiro da sessão (não só
 * o pedido mais recente, ver `reviseCustomLandingFiles`), sem publicar nada. Diferente de publicar,
 * não passa pelo fluxo `generating` → poll: não há deploy na Vercel aqui, só uma chamada de IA de
 * alguns segundos, então a action pode aguardar direto.
 */
export async function reviseLandingDraft(productId: string, note: string): Promise<LandingPageDraft> {
  const draft = await repo.findLandingPageDraft(productId)
  if (!draft) {
    throw new LandingGenerationError(`Produto ${productId} não tem rascunho de landing — envie um zip primeiro.`)
  }

  const { files, costUsd } = await reviseCustomLandingFiles({
    productId,
    files: draft.files,
    note,
    history: draft.history,
  })
  const history = [...draft.history, { note, createdAt: new Date().toISOString() }]
  const updated = await repo.upsertLandingPageDraft(productId, { files, history })

  await recordDecision({
    productId,
    actor: 'human',
    decision: 'REVISE_CUSTOM_LANDING_DRAFT',
    rationale: `Rascunho de landing ajustado a pedido do fundador ("${note}"). Custo: US$ ${costUsd.toFixed(4)}.`,
  })

  return updated
}

/**
 * Publica o rascunho atual — deploya na Vercel de verdade e grava a linha `landing_pages`
 * (histórico do que foi de fato publicado). Recebe a linha `generating` já criada
 * (`startCustomLandingUpload`, sem mudança), mesmo padrão assíncrono de sempre pro deploy em si.
 */
export async function publishLandingDraft(landingPage: LandingPage): Promise<LandingPage> {
  const draft = await repo.findLandingPageDraft(landingPage.productId)
  if (!draft) {
    throw new LandingGenerationError(`Produto ${landingPage.productId} não tem rascunho de landing pra publicar.`)
  }
  return deployCustomLanding(landingPage, draft.files)
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
  findLatestLandingPage,
  findLatestReadyLandingPage,
  findLandingPage,
  findLandingPageDraft,
  listWaitlistSignups,
} from './repo'
