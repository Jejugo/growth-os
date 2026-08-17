import { task, logger } from '@trigger.dev/sdk'
import { runPublisher } from '@/modules/distribution/publisher'

export interface PublishPostPayload {
  publicationId: string
}

export const publishPostTask = task({
  id: 'publish-post',
  maxDuration: 60,
  run: async (payload: PublishPostPayload) => {
    logger.info('Iniciando publicação', { publicationId: payload.publicationId })

    const result = await runPublisher(payload.publicationId)

    logger.info('Publicação concluída', { publicationId: payload.publicationId, ...result })
    return result
  },
})
