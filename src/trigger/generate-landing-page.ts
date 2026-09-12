import { task, logger } from '@trigger.dev/sdk'
import { newId } from '@/lib/ids'
import { claimJobRun, finishJobRun } from '@/lib/observability/service'
import { generateLandingPage, findLandingPage } from '@/modules/validation'
import type { LandingPage, LandingPageCopy } from '@/modules/validation'

export interface GenerateLandingPagePayload {
  productId: string
  /** Linha `landing_pages` (status `generating`) já criada pelo dispatcher antes de disparar este job. */
  landingPageId: string
  /**
   * Gerada pelo dispatcher (não deriva só do productId) — cada clique em
   * "gerar" é uma tentativa independente e precisa poder rodar de novo mesmo
   * que a tentativa anterior tenha terminado em "blocked"/"failed".
   */
  runKey: string
  /** Presente quando o fundador pediu ajustes numa landing já publicada, em vez de gerar do zero. */
  adjustment?: { previousCopy: LandingPageCopy; note: string }
}

export const generateLandingPageTask = task({
  id: 'generate-landing-page',
  maxDuration: 120,
  run: async (payload: GenerateLandingPagePayload, { ctx }) => {
    const key = `generate-landing-page:${payload.runKey}`
    const claim = await claimJobRun({
      taskName: 'generate-landing-page',
      idempotencyKey: key,
      productId: payload.productId,
      triggerRunId: ctx.run.id,
      payload: { ...payload },
    })
    if (!claim) {
      logger.info('Geração de landing page já concluída.', { key })
      return { status: 'skipped' as const, reason: 'already-completed' }
    }

    try {
      const existing = await findLandingPage(payload.landingPageId)
      if (!existing) throw new Error(`landing_pages ${payload.landingPageId} não encontrada.`)
      const landingPage = await generateLandingPage(existing, payload.adjustment)
      await finishJobRun(claim.id, 'completed', { result: { ...landingPage } })
      return { status: 'completed' as const, landingPage }
    } catch (error) {
      await finishJobRun(claim.id, 'failed', { error })
      throw error
    }
  },
})

export function newLandingPageRunKey(): string {
  return newId()
}

export type { LandingPage }
