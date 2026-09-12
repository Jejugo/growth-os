import { task, logger } from '@trigger.dev/sdk'
import { claimJobRun, finishJobRun, recordDecision } from '@/lib/observability/service'
import { AIBudgetExceededError } from '@/modules/ai'
import { getCurrentProfile, findProduct } from '@/modules/products'
import { listSegments } from '@/modules/audiences'
import { CHANNEL_CAPABILITIES } from '@/modules/content/types'
import {
  findActiveCampaign,
  findCampaign,
  listThemes,
  activateCampaign,
  planNewCampaign,
} from '@/modules/campaigns'
import {
  recentAngleUsage,
  recentPostsMemory,
  recentRejectionReasons,
} from '@/modules/content'
import { generateIdeaForAngle, selectAnglesForWeek } from '@/modules/campaigns/ai/generate-ideas'
import { listActiveLearnings, getRollupsByDimension } from '@/modules/analytics'
import { planContentWeekIdempotencyKey, isoWeek } from './idempotency-keys'
import { writePost } from '@/modules/content/ai/write-post'
import { reviewRisk } from '@/modules/content/ai/review-risk'
import { checkDedupe, prepareFingerprint } from '@/modules/content/dedupe'
import {
  insertIdea,
  insertPost,
  insertFingerprints,
  setIdeaStatus,
} from '@/modules/content/repo'
import { findSegment } from '@/modules/audiences/repo'
import type { AudienceSegment } from '@/modules/audiences/schema'
import type { ContentTheme } from '@/modules/campaigns/schema'
import type { ContentAngle } from '@/modules/content/types'

/** Produto fora de `stage = 'launched'` não passa pelo pipeline genérico de campanha. */
export class ProductStageBlockedError extends Error {
  constructor(readonly stage: string) {
    super(`Produto em estágio '${stage}' não gera conteúdo pelo pipeline semanal genérico.`)
    this.name = 'ProductStageBlockedError'
  }
}

export interface PlanContentWeekPayload {
  productId: string
  campaignId?: string
  weekOf?: string // ISO date (YYYY-MM-DD)
}

/** Canais padrão por semana. Pode ser tornar configurável na fase 2. */
const DEFAULT_CHANNELS = ['bluesky', 'linkedin', 'newsletter'] as const

/** Total de ideias a gerar por semana. */
const IDEAS_PER_WEEK = 10

/** Máximo de posts paralelos. */
const MAX_PARALLEL_POSTS = 4

/** Tentativas de regeneração se dedupe rejeitar. */
const MAX_DEDUPE_RETRIES = 2

/** Reexportada por compat — implementação real em `./idempotency-keys`. */
export { planContentWeekIdempotencyKey as idempotencyKeyFor } from './idempotency-keys'

export const planContentWeekTask = task({
  id: 'plan-content-week',
  maxDuration: 600,
  run: async (payload: PlanContentWeekPayload, { ctx }) => {
    const key = planContentWeekIdempotencyKey(payload)

    const claim = await claimJobRun({
      taskName: 'plan-content-week',
      idempotencyKey: key,
      productId: payload.productId,
      triggerRunId: ctx.run.id,
      payload: { ...payload },
    })

    if (!claim) {
      logger.info('Planejamento já concluído para esta chave.', { key })
      return { status: 'skipped' as const, reason: 'already-completed' }
    }

    try {
      const result = await runPipeline(payload, claim.id)
      await finishJobRun(claim.id, 'completed', { result })
      logger.info('Planejamento concluído', result)
      return result
    } catch (error) {
      if (error instanceof ProductStageBlockedError) {
        await recordDecision({
          productId: payload.productId,
          actor: 'content-planner',
          decision: 'NO_ACTION',
          rationale: error.message,
          jobRunId: claim.id,
        })
        await finishJobRun(claim.id, 'cancelled', { error })
        return { status: 'skipped' as const, reason: 'wrong-stage' }
      }

      if (error instanceof AIBudgetExceededError) {
        await recordDecision({
          productId: payload.productId,
          actor: 'budget-guard',
          decision: 'NO_ACTION',
          rationale: (error as Error).message,
          jobRunId: claim.id,
        })
        await finishJobRun(claim.id, 'cancelled', { error })
        return { status: 'skipped' as const, reason: 'budget-exceeded' }
      }

      await finishJobRun(claim.id, 'failed', { error })
      throw error
    }
  },
})

// --- Pipeline de 10 passos (exportado para inline runner) ---------------

export async function runContentWeekPipeline(
  payload: PlanContentWeekPayload,
  jobRunId: string,
) {
  return runPipeline(payload, jobRunId)
}

async function runPipeline(
  payload: PlanContentWeekPayload,
  jobRunId: string,
): Promise<{
  status: 'completed'
  campaignId: string
  ideasCount: number
  postsCount: number
  totalCostUsd: number
}> {
  const { productId } = payload
  let totalCostUsd = 0

  // Passo 1: carrega perfil + segmentos + memória de conteúdo
  logger.info('Passo 1: carregando contexto')
  const [product, profile] = await Promise.all([
    findProduct(productId),
    getCurrentProfile(productId),
  ])
  if (!product) {
    throw new Error(`Produto ${productId} não existe.`)
  }
  // 'idea' não tem landing para onde mandar tráfego; 'validating' usa o
  // pipeline dedicado de `generate-validation-content` (ângulos do
  // experimento, não temas de campanha); 'building' está deliberadamente em
  // silêncio (fase 4.5, roadmap §6.5 — NO_ACTION é resultado de primeira classe).
  if (product.stage !== 'launched') {
    throw new ProductStageBlockedError(product.stage)
  }
  if (!profile) {
    throw new Error(`Produto ${productId} não tem perfil atual.`)
  }

  const segments = await listSegments(productId)
  if (segments.length === 0) {
    throw new Error(`Produto ${productId} não tem segmentos ativos.`)
  }

  const [recentPosts, rejectionReasons, activeLearnings] = await Promise.all([
    recentPostsMemory(productId, 20),
    recentRejectionReasons(productId, 10),
    listActiveLearnings(productId),
  ])

  // Passo 2: obtém ou cria campanha
  logger.info('Passo 2: obtendo campanha')
  let campaign = payload.campaignId
    ? await findCampaign(payload.campaignId)
    : await findActiveCampaign(productId)

  if (!campaign) {
    logger.info('Nenhuma campanha ativa — planejando nova')
    const { campaign: newCampaign, costUsd } = await planNewCampaign({
      productId,
      jobRunId,
    })
    campaign = newCampaign
    totalCostUsd += costUsd
    await activateCampaign(campaign.id)
  }

  // Passo 3: calcula distribuição-alvo de ângulos (em código)
  logger.info('Passo 3: calculando distribuição de ângulos com aprendizados')
  const [recentAngles, angleRollups] = await Promise.all([
    recentAngleUsage(productId, 30),
    getRollupsByDimension(productId, 'angle', '28d'),
  ])

  const angleLearnings = activeLearnings.filter((l) => l.dimension === 'angle')
  const angleSignupRates: Record<string, number> = {}
  for (const r of angleRollups) {
    if (r.sampleSufficient) {
      angleSignupRates[r.dimensionValue] = Number(r.signupRate)
    }
  }

  const anglePlan = selectAnglesForWeek({
    totalIdeas: IDEAS_PER_WEEK,
    recentAngleCounts: recentAngles,
    angleLearnings,
    angleSignupRates,
  })

  logger.info('Ângulos planejados', {
    guided: anglePlan.filter((a) => !a.isExploration).map((a) => a.angle),
    exploration: anglePlan.filter((a) => a.isExploration).map((a) => a.angle),
  })

  // Passo 4–5: gera ideias por ângulo com dedupe
  logger.info('Passos 4–5: gerando e deduplicando ideias')
  const themes = await listThemes(campaign.id)
  if (themes.length === 0) {
    throw new Error(`Campanha ${campaign.id} não tem temas.`)
  }

  const validIdeas: Array<{
    idea: Awaited<ReturnType<typeof insertIdea>>
    segment: AudienceSegment
    theme: ContentTheme
    isExploration: boolean
  }> = []

  const recentIdeaTitles = recentPosts.map((p) => p.hook)

  for (const { angle, isExploration } of anglePlan) {
    const theme = pickTheme(themes, angle)
    const segment = pickSegment(segments)

    let saved = null
    for (let attempt = 0; attempt <= MAX_DEDUPE_RETRIES; attempt++) {
      const { idea, costUsd } = await generateIdeaForAngle({
        productId,
        profile,
        theme,
        segment,
        angle,
        recentIdeas: recentIdeaTitles,
      })
      totalCostUsd += costUsd

      // Dedupe da ideia
      const dedupeResult = await checkDedupe({
        productId,
        kind: 'idea',
        text: idea.title + ' ' + idea.summary,
      })

      if (dedupeResult.verdict === 'ok') {
        // Salva a ideia e registra fingerprint
        const savedIdea = await insertIdea({
          productId,
          campaignId: campaign.id,
          themeId: theme.id,
          audienceSegmentId: segment.id,
          title: idea.title,
          summary: idea.summary,
          angle,
          supportingFacts: idea.supportingFacts ?? null,
        })

        const { normalizedText, hash } = prepareFingerprint(
          idea.title + ' ' + idea.summary,
          'idea',
        )
        await insertFingerprints([
          { productId, ideaId: savedIdea.id, kind: 'idea', normalizedText, hash },
        ])

        saved = { idea: savedIdea, segment, theme, isExploration }
        recentIdeaTitles.push(idea.title)
        break
      }

      if (dedupeResult.verdict === 'near_duplicate') {
        const savedIdea = await insertIdea({
          productId,
          campaignId: campaign.id,
          themeId: theme.id,
          audienceSegmentId: segment.id,
          title: idea.title,
          summary: `[near_duplicate:${dedupeResult.similarity.toFixed(2)}] ${idea.summary}`,
          angle,
          supportingFacts: idea.supportingFacts ?? null,
        })

        const { normalizedText, hash } = prepareFingerprint(
          idea.title + ' ' + idea.summary,
          'idea',
        )
        await insertFingerprints([
          { productId, ideaId: savedIdea.id, kind: 'idea', normalizedText, hash },
        ])

        saved = { idea: savedIdea, segment, theme, isExploration }
        recentIdeaTitles.push(idea.title)
        break
      }

      logger.warn(`Ideia duplicada, tentativa ${attempt + 1}`, { angle })
    }

    if (saved) validIdeas.push(saved)
  }

  logger.info('Ideias geradas', { count: validIdeas.length })

  // Passo 6: seleciona ideias × canais
  logger.info('Passo 6: selecionando combinações ideia × canal')
  const combinations: Array<{
    idea: (typeof validIdeas)[number]['idea']
    segment: AudienceSegment
    channel: (typeof DEFAULT_CHANNELS)[number]
    isExploration: boolean
  }> = []

  for (const { idea, segment, isExploration } of validIdeas) {
    for (const channel of DEFAULT_CHANNELS) {
      combinations.push({ idea, segment, channel, isExploration })
    }
  }

  // Passo 7–9: escreve posts, dedupe de hook/arg/cta, risk reviewer
  logger.info('Passos 7–9: escrevendo e revisando posts')
  const savedPosts: Array<Awaited<ReturnType<typeof insertPost>>> = []

  // Processa em lotes de MAX_PARALLEL_POSTS
  for (let i = 0; i < combinations.length; i += MAX_PARALLEL_POSTS) {
    const batch = combinations.slice(i, i + MAX_PARALLEL_POSTS)

    const results = await Promise.allSettled(
      batch.map(async ({ idea, segment, channel, isExploration }) => {
        // Escreve o post — com aprendizados se não for exploração
        const { post: written, costUsd: writeCost } = await writePost({
          productId,
          profile,
          idea,
          segment,
          channel,
          recentPosts: recentPosts as Parameters<typeof writePost>[0]['recentPosts'],
          rejectionReasons,
          activeLearnings,
          isExploration,
        })
        totalCostUsd += writeCost

        // Passo 8: dedupe de hook/argumento/CTA
        const hookDedupeResult = await checkDedupe({
          productId,
          kind: 'hook',
          text: written.hook,
        })

        // Duplicata exata de hook → descarta e loga
        if (hookDedupeResult.verdict === 'duplicate') {
          logger.warn('Hook duplicado descartado', { hook: written.hook, channel })
          return null
        }

        // Salva o post com status initial.
        // linkUrl: usa a URL do produto quando o post tem CTA (não é 'none'),
        // para que o publisher gere um tracking link rastreável.
        const linkUrl =
          written.ctaType !== 'none' && CHANNEL_CAPABILITIES[channel]?.supportsLinks
            ? (product?.url ?? null)
            : null

        const savedPost = await insertPost({
          productId,
          ideaId: idea.id,
          campaignId: campaign!.id,
          channel,
          hook: written.hook,
          body: written.body,
          cta: written.cta ?? null,
          ctaType: written.ctaType,
          linkUrl,
          status: 'draft',
        })

        // Registra fingerprints de hook/argumento/CTA
        const fingerprints: Parameters<typeof insertFingerprints>[0] = []

        const hookFp = prepareFingerprint(written.hook, 'hook')
        fingerprints.push({ productId, postId: savedPost.id, kind: 'hook', ...hookFp })

        if (written.cta) {
          const ctaFp = prepareFingerprint(written.cta, 'cta')
          fingerprints.push({ productId, postId: savedPost.id, kind: 'cta', ...ctaFp })
        }

        const argFp = prepareFingerprint(written.body, 'argument')
        fingerprints.push({ productId, postId: savedPost.id, kind: 'argument', ...argFp })

        await insertFingerprints(fingerprints)

        // Passo 9: Risk Reviewer
        const { review, costUsd: reviewCost } = await reviewRisk({
          productId,
          post: savedPost,
          profile,
        })
        totalCostUsd += reviewCost

        // Atualiza o post com o risk review e muda para pending_approval
        await import('@/modules/content/repo').then((r) => r.setPostRiskReview(savedPost.id, review))

        // Posts com `block` ficam em draft para forçar edição antes de poder aprovar
        const finalStatus: typeof savedPost.status =
          review.verdict === 'block' ? 'draft' : 'pending_approval'

        await import('@/modules/content/repo').then((r) =>
          r.setPostStatus(savedPost.id, finalStatus),
        )

        // Alerta near_duplicate no hook
        if (hookDedupeResult.verdict === 'near_duplicate') {
          await recordDecision({
            productId,
            actor: 'dedupe',
            decision: 'NEAR_DUPLICATE',
            rationale: `Hook do post ${savedPost.id} é similar (${hookDedupeResult.similarity.toFixed(2)}) ao post ${hookDedupeResult.existingId}.`,
            jobRunId,
          })
        }

        return savedPost
      }),
    )

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        savedPosts.push(result.value)
      } else if (result.status === 'rejected') {
        logger.error('Falha ao gerar post', { error: result.reason })
      }
    }
  }

  // Passo 10: registra decisão e custo total
  logger.info('Passo 10: finalizando')
  await recordDecision({
    productId,
    actor: 'content-planner',
    decision: 'PLAN_WEEK',
    rationale: `Semana planejada: ${validIdeas.length} ideias, ${savedPosts.length} posts gerados. Custo total: US$ ${totalCostUsd.toFixed(4)}.`,
    jobRunId,
  })

  return {
    status: 'completed' as const,
    campaignId: campaign.id,
    ideasCount: validIdeas.length,
    postsCount: savedPosts.length,
    totalCostUsd,
  }
}

// --- Helpers ------------------------------------------------------------

let themeIndex = 0
function pickTheme(themes: ContentTheme[], _angle: ContentAngle): ContentTheme {
  // Round-robin pelos temas para distribuir
  const theme = themes[themeIndex % themes.length]!
  themeIndex++
  return theme
}

function pickSegment(segments: AudienceSegment[]): AudienceSegment {
  // Prioriza segmentos com maior score de fit
  const sorted = [...segments].sort((a, b) => b.audienceFitScore - a.audienceFitScore)
  // Alterna entre os dois melhores para variedade
  return sorted[themeIndex % Math.min(2, sorted.length)]!
}
