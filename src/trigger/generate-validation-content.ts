import { task, logger } from '@trigger.dev/sdk'
import { claimJobRun, finishJobRun, recordDecision } from '@/lib/observability/service'
import { findProduct, getCurrentProfile } from '@/modules/products'
import { findValidation, findBriefById } from '@/modules/validation'
import {
  listExperimentVariants,
  setPostVariant,
  recentPostsMemory,
  checkDedupe,
  prepareFingerprint,
} from '@/modules/content'
import { insertIdea, insertPost, insertFingerprints, setPostRiskReview, setPostStatus } from '@/modules/content/repo'
import { reviewRisk } from '@/modules/content/ai/review-risk'
import { writeValidationPost } from '@/modules/validation/ai/write-validation-post'
import type { PositioningVariant } from '@/modules/validation/types'

export interface GenerateValidationContentPayload {
  validationId: string
}

/** Canais padrão do teste. Bluesky é o V1 obrigatório do roadmap; LinkedIn cobre B2B. */
const VALIDATION_CHANNELS = ['bluesky', 'linkedin'] as const

export function idempotencyKeyFor(payload: GenerateValidationContentPayload): string {
  return `generate-validation-content:${payload.validationId}`
}

export const generateValidationContentTask = task({
  id: 'generate-validation-content',
  maxDuration: 300,
  run: async (payload: GenerateValidationContentPayload, { ctx }) => {
    const key = idempotencyKeyFor(payload)
    const claim = await claimJobRun({
      taskName: 'generate-validation-content',
      idempotencyKey: key,
      triggerRunId: ctx.run.id,
      payload: { ...payload },
    })
    if (!claim) {
      logger.info('Geração de conteúdo de validação já concluída.', { key })
      return { status: 'skipped' as const, reason: 'already-completed' }
    }

    try {
      const result = await runGenerateValidationContentPipeline(payload, claim.id)
      await finishJobRun(claim.id, 'completed', { result })
      return result
    } catch (error) {
      await finishJobRun(claim.id, 'failed', { error })
      throw error
    }
  },
})

export async function runGenerateValidationContentPipeline(
  payload: GenerateValidationContentPayload,
  jobRunId: string,
): Promise<{ status: 'completed'; postsCount: number; totalCostUsd: number }> {
  const validation = await findValidation(payload.validationId)
  if (!validation) throw new Error(`Validação ${payload.validationId} não encontrada.`)
  if (!validation.campaignId || !validation.contentThemeId) {
    throw new Error(`Validação ${payload.validationId} sem campanha/tema.`)
  }

  const [product, brief] = await Promise.all([
    findProduct(validation.productId),
    findBriefById(validation.briefId),
  ])
  if (!product) throw new Error(`Produto ${validation.productId} não existe.`)
  if (!brief) throw new Error(`Brief ${validation.briefId} não existe.`)

  const profile = await getCurrentProfile(validation.productId)
  if (!profile) throw new Error(`Produto ${validation.productId} sem perfil — impossível revisar risco.`)

  const variants = validation.experimentId ? await listExperimentVariants(validation.experimentId) : []
  if (variants.length === 0) {
    logger.warn('Validação sem variantes de experimento — nada a gerar.', { validationId: validation.id })
    return { status: 'completed', postsCount: 0, totalCostUsd: 0 }
  }

  const recentPosts = await recentPostsMemory(validation.productId, 20)
  let totalCostUsd = 0
  let postsCount = 0

  for (const variant of variants) {
    const spec = variant.spec as { positioningAngle?: string } | null
    const positioningVariant: PositioningVariant = {
      name: variant.name,
      description: variant.description ?? variant.name,
      positioningAngle: spec?.positioningAngle ?? variant.name,
    }

    // A "ideia" É o ângulo de posicionamento — não há geração de ideia
    // separada aqui, ao contrário do pipeline semanal genérico.
    const idea = await insertIdea({
      productId: validation.productId,
      campaignId: validation.campaignId,
      themeId: validation.contentThemeId,
      title: positioningVariant.name,
      summary: positioningVariant.description,
      angle: 'solution',
    })

    for (const channel of VALIDATION_CHANNELS) {
      try {
        logger.info(`Gerando post de validação para ${channel}`, { variant: variant.label })
        const { post: written, costUsd } = await writeValidationPost({
          productId: validation.productId,
          brief,
          variant: positioningVariant,
          channel,
          landingUrl: validation.landingUrl,
          recentPosts: recentPosts.map((p) => ({ hook: p.hook, cta: p.cta })),
        })
        logger.info(`Post gerado com sucesso para ${channel}`, { hook: written.hook })
        totalCostUsd += costUsd

        const hookDedupe = await checkDedupe({
          productId: validation.productId,
          kind: 'hook',
          text: written.hook,
        })
        if (hookDedupe.verdict === 'duplicate') {
          logger.warn('Hook duplicado descartado na validação', { hook: written.hook, channel })
          continue
        }

        const savedPost = await insertPost({
          productId: validation.productId,
          ideaId: idea.id,
          campaignId: validation.campaignId,
          channel,
          hook: written.hook,
          body: written.body,
          cta: written.cta ?? null,
          ctaType: written.ctaType,
          linkUrl: validation.landingUrl,
          status: 'draft',
        })

        await setPostVariant(savedPost.id, variant.id)

        const hookFp = prepareFingerprint(written.hook, 'hook')
        await insertFingerprints([
          { productId: validation.productId, postId: savedPost.id, kind: 'hook', ...hookFp },
        ])

        const { review, costUsd: reviewCost } = await reviewRisk({
          productId: validation.productId,
          post: savedPost,
          profile,
        })
        totalCostUsd += reviewCost

        await setPostRiskReview(savedPost.id, review)
        await setPostStatus(savedPost.id, review.verdict === 'block' ? 'draft' : 'pending_approval')

        postsCount++
      } catch (err) {
        logger.error('Falha ao gerar post de validação', {
          error: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
          variant: variant.label,
          channel
        })
      }
    }
  }

  await recordDecision({
    productId: validation.productId,
    actor: 'validation-content-writer',
    decision: 'GENERATE_VALIDATION_CONTENT',
    rationale: `${postsCount} posts gerados para ${variants.length} ângulos, apontando para ${validation.landingUrl}. Custo: US$ ${totalCostUsd.toFixed(4)}.`,
    jobRunId,
  })

  return { status: 'completed', postsCount, totalCostUsd }
}
