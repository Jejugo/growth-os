import { task, logger } from '@trigger.dev/sdk'
import { analyzeProduct } from '@/modules/products'
import { claimJobRun, finishJobRun } from '@/lib/observability/service'
import { AIBudgetExceededError } from '@/modules/ai'
import { recordDecision } from '@/lib/observability/service'

export interface AnalyzeProductPayload {
  productId: string
  force?: boolean
}

/**
 * Casca fina: toda a regra vive em `modules/products/service.ts`, que é
 * testável sem o Trigger.dev. Aqui só ficam idempotência, log e retry.
 */
export const analyzeProductTask = task({
  id: 'analyze-product',
  maxDuration: 600,
  run: async (payload: AnalyzeProductPayload, { ctx }) => {
    const key = idempotencyKeyFor(payload)

    const claim = await claimJobRun({
      taskName: 'analyze-product',
      idempotencyKey: key,
      productId: payload.productId,
      triggerRunId: ctx.run.id,
      payload: { ...payload },
    })

    if (!claim) {
      logger.info('Análise já concluída para esta chave; nada a fazer.', { key })
      return { status: 'skipped' as const, reason: 'already-completed' }
    }

    try {
      const outcome = await analyzeProduct({
        productId: payload.productId,
        force: payload.force,
        jobRunId: claim.id,
      })

      await finishJobRun(claim.id, 'completed', { result: { ...outcome } })
      logger.info('Análise concluída', { ...outcome })
      return outcome
    } catch (error) {
      // Orçamento estourado não é falha transitória — retry só queimaria
      // tentativas. Encerra como cancelado, com o motivo registrado.
      if (error instanceof AIBudgetExceededError) {
        await recordDecision({
          productId: payload.productId,
          actor: 'budget-guard',
          decision: 'NO_ACTION',
          rationale: error.message,
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

/**
 * Mesma URL, mesma hora ⇒ mesma chave: um clique duplo em "reanalisar" não
 * roda o pipeline duas vezes. `force` acrescenta um nonce, porque aí a
 * intenção é justamente refazer.
 */
export function idempotencyKeyFor(payload: AnalyzeProductPayload, now = new Date()): string {
  const hour = now.toISOString().slice(0, 13) // YYYY-MM-DDTHH
  const suffix = payload.force ? `:force:${now.getTime()}` : ''
  return `analyze-product:${payload.productId}:${hour}${suffix}`
}
