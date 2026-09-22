import { task, schedules, logger } from '@trigger.dev/sdk'
import { recordDecision } from '@/lib/observability/service'
import { setPostStatus } from '@/modules/content/repo'
import {
  expireAwaitingManualPublication,
  listExpiredManualPublications,
} from '@/modules/distribution/repo'
import { MANUAL_EXPIRATION_MS } from '@/modules/distribution/manual'

export const expireManualPublicationsTask = task({
  id: 'expire-manual-publications',
  maxDuration: 120,
  run: async () => {
    const cutoff = new Date(Date.now() - MANUAL_EXPIRATION_MS)
    const candidates = await listExpiredManualPublications(cutoff)
    let expired = 0

    for (const candidate of candidates) {
      const publication = await expireAwaitingManualPublication(candidate.id)
      if (!publication) continue

      await setPostStatus(publication.postId, 'cancelled')
      await recordDecision({
        productId: publication.productId,
        actor: 'expirer',
        decision: 'CANCEL',
        rationale: 'expirou sem publicação manual',
      })
      expired++
    }

    logger.info('Expiração de publicações manuais concluída', {
      candidates: candidates.length,
      expired,
    })
    return { candidates: candidates.length, expired }
  },
})

export const expireManualPublicationsCron = schedules.task({
  id: 'expire-manual-publications-hourly',
  cron: '15 * * * *',
  maxDuration: 120,
  run: async () => expireManualPublicationsTask.triggerAndWait(),
})
