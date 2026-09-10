import { task, logger } from '@trigger.dev/sdk'
import { newId } from '@/lib/ids'
import { claimJobRun, finishJobRun } from '@/lib/observability/service'
import { deployCustomLanding, findLandingPage } from '@/modules/validation'
import type { LandingPage } from '@/modules/validation'

export interface UploadCustomLandingPayload {
  productId: string
  /** Linha `landing_pages` (status `generating`, `source: 'custom_upload'`) já criada pelo dispatcher. */
  landingPageId: string
  /** Arquivos já validados por `parseCustomLandingZip` antes de disparar este job. */
  files: Array<{ file: string; data: string }>
  /** Gerada pelo dispatcher — cada upload é uma tentativa independente, mesmo motivo de `generate-landing-page`. */
  runKey: string
}

export const uploadCustomLandingTask = task({
  id: 'upload-custom-landing',
  maxDuration: 120,
  run: async (payload: UploadCustomLandingPayload, { ctx }) => {
    const key = `upload-custom-landing:${payload.runKey}`
    const claim = await claimJobRun({
      taskName: 'upload-custom-landing',
      idempotencyKey: key,
      productId: payload.productId,
      triggerRunId: ctx.run.id,
      payload: { productId: payload.productId, landingPageId: payload.landingPageId, runKey: payload.runKey },
    })
    if (!claim) {
      logger.info('Upload de landing customizada já concluído.', { key })
      return { status: 'skipped' as const, reason: 'already-completed' }
    }

    try {
      const existing = await findLandingPage(payload.landingPageId)
      if (!existing) throw new Error(`landing_pages ${payload.landingPageId} não encontrada.`)
      const landingPage = await deployCustomLanding(existing, payload.files)
      await finishJobRun(claim.id, 'completed', { result: { ...landingPage } })
      return { status: 'completed' as const, landingPage }
    } catch (error) {
      await finishJobRun(claim.id, 'failed', { error })
      throw error
    }
  },
})

export function newUploadCustomLandingRunKey(): string {
  return newId()
}

export type { LandingPage }
