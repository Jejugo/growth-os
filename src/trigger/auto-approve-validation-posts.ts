import { task, logger } from '@trigger.dev/sdk'
import { db } from '@/lib/db'
import { socialPosts } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'

/**
 * Auto-aprova posts de validação que passaram no risk review sem problemas.
 * Roda após generate-validation-content, transiciona pending_approval → approved
 * apenas para posts com riskReview.verdict === "pass".
 *
 * Idempotente: verifica status antes de fazer nada.
 */
export const autoApproveValidationPostsTask = task({
  id: 'auto-approve-validation-posts',
  maxDuration: 60,
  run: async (payload: { productId: string }) => {
    const { productId } = payload

    // Busca posts em pending_approval com risk review = "pass"
    const candidatePosts = await db
      .select()
      .from(socialPosts)
      .where(eq(socialPosts.productId, productId))

    const toApprove = candidatePosts.filter((post) => {
      const review = post.riskReview as { verdict: string } | null
      return post.status === 'pending_approval' && review?.verdict === 'pass'
    })

    if (toApprove.length === 0) {
      logger.info('Nenhum post de validação para auto-aprovar', { productId })
      return { status: 'no_action', approvedCount: 0 }
    }

    let approved = 0
    let failed = 0

    for (const post of toApprove) {
      try {
        await db
          .update(socialPosts)
          .set({ status: 'approved' })
          .where(eq(socialPosts.id, post.id))

        logger.info(`Post ${post.id} aprovado automaticamente`, {
          hook: post.hook,
          channel: post.channel,
        })
        approved++
      } catch (err) {
        logger.error(`Falha ao aprovar post ${post.id}`, { error: err })
        failed++
      }
    }

    logger.info('Auto-aprovação de validação concluída', { approved, failed, productId })
    return { status: 'completed', approvedCount: approved, failedCount: failed }
  },
})
