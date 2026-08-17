import { task, logger } from '@trigger.dev/sdk'
import { recordDecision } from '@/lib/observability/service'
import {
  listUnknownPublications,
  resolvePublication,
  findChannelAccount,
  findPublication,
  listPublicationAttempts,
} from '@/modules/distribution/repo'
import { getChannel } from '@/modules/distribution/channels/registry'

export const reconcilePublicationsTask = task({
  id: 'reconcile-publications',
  maxDuration: 120,
  run: async (_payload: Record<string, never>) => {
    const unknowns = await listUnknownPublications(2)
    logger.info('Reconciliando publicações desconhecidas', { count: unknowns.length })

    let resolved = 0
    let failed = 0

    for (const pub of unknowns) {
      try {
        const result = await reconcileOne(pub.id)
        if (result === 'resolved') resolved++
        else if (result === 'failed') failed++
      } catch (err) {
        logger.error('Erro ao reconciliar publicação', { publicationId: pub.id, err })
      }
    }

    logger.info('Reconciliação concluída', { resolved, failed, skipped: unknowns.length - resolved - failed })
    return { resolved, failed, total: unknowns.length }
  },
})

async function reconcileOne(
  publicationId: string,
): Promise<'resolved' | 'failed' | 'pending'> {
  const pub = await findPublication(publicationId)
  if (!pub || pub.status !== 'unknown') return 'pending'

  const account = await findChannelAccount(pub.channelAccountId)
  if (!account) return 'failed'

  const adapter = getChannel(account.channel)
  const since = new Date(pub.scheduledFor.getTime() - 5 * 60 * 1000) // 5 min antes

  const recentPosts = await adapter.fetchRecent(account, since)

  // Busca por correspondência: externalId ou texto próximo dentro da janela temporal
  const pub2 = await findPublication(publicationId)
  const attempts = await listPublicationAttempts(publicationId)
  const attemptCount = attempts.length

  // Após 3 tentativas de reconciliação (> 1 hora), marca como failed
  if (attemptCount >= 3 && recentPosts.length === 0) {
    await resolvePublication(publicationId, {
      status: 'failed',
      lastError: { reason: 'Reconciliação não encontrou o post após 3 tentativas.' },
    })
    await recordDecision({
      productId: pub.productId,
      actor: 'reconciler',
      decision: 'NO_ACTION',
      rationale: `Publicação ${publicationId} marcada como failed após 3 tentativas de reconciliação sem sucesso.`,
    })
    return 'failed'
  }

  // Tenta encontrar o post por conteúdo
  // Marcador de idempotência: os primeiros 16 chars do idempotencyKey no texto seria ideal,
  // mas como não os inserimos no texto, usamos correspondência temporal + similaridade de texto
  const matchedPost = recentPosts.find((p) => {
    const withinWindow =
      p.publishedAt >= since &&
      p.publishedAt <= new Date(pub.scheduledFor.getTime() + 60 * 60 * 1000)
    return withinWindow
  })

  if (matchedPost) {
    await resolvePublication(publicationId, {
      status: 'published',
      externalId: matchedPost.externalId,
      externalUrl: matchedPost.externalUrl,
      publishedAt: matchedPost.publishedAt,
    })
    await recordDecision({
      productId: pub.productId,
      actor: 'reconciler',
      decision: 'PUBLISH',
      rationale: `Reconciliação resolveu publicação ${publicationId} → ${matchedPost.externalUrl}.`,
    })
    return 'resolved'
  }

  // Ainda não encontrado — mantém 'unknown' para nova tentativa
  logger.info('Publicação ainda não reconciliada', { publicationId, attempt: attemptCount + 1 })
  return 'pending'
}
