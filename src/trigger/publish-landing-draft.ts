import { task, logger } from '@trigger.dev/sdk'
import { claimJobRun, finishJobRun } from '@/lib/observability/service'
import { publishLandingDraft, findLandingPage } from '@/modules/validation'
import type { LandingPage } from '@/modules/validation'

export interface PublishLandingDraftPayload {
  productId: string
  /** Linha `landing_pages` (status `generating`, `source: 'custom_upload'`) já criada pelo dispatcher. */
  landingPageId: string
  /** Gerada pelo dispatcher — cada publicação é uma tentativa independente. */
  runKey: string
}

export const publishLandingDraftTask = task({
  id: 'publish-landing-draft',
  maxDuration: 120,
  run: async (payload: PublishLandingDraftPayload, { ctx }) => {
    const key = `publish-landing-draft:${payload.runKey}`
    const claim = await claimJobRun({
      taskName: 'publish-landing-draft',
      idempotencyKey: key,
      productId: payload.productId,
      triggerRunId: ctx.run.id,
      payload: { productId: payload.productId, landingPageId: payload.landingPageId, runKey: payload.runKey },
    })
    if (!claim) {
      logger.info('Publicação de rascunho de landing já concluída.', { key })
      return { status: 'skipped' as const, reason: 'already-completed' }
    }

    try {
      const existing = await findLandingPage(payload.landingPageId)
      if (!existing) throw new Error(`landing_pages ${payload.landingPageId} não encontrada.`)
      const landingPage = await publishLandingDraft(existing)
      await finishJobRun(claim.id, 'completed', { result: { ...landingPage } })
      return { status: 'completed' as const, landingPage }
    } catch (error) {
      await finishJobRun(claim.id, 'failed', { error })
      throw error
    }
  },
})

export type { LandingPage }
