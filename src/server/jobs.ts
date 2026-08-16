import { analyzeProductTask, idempotencyKeyFor, type AnalyzeProductPayload } from '@/trigger/analyze-product'
import { analyzeProduct } from '@/modules/products'
import { claimJobRun, finishJobRun } from '@/lib/observability/service'

/**
 * Despacha a análise sem bloquear a resposta da UI.
 *
 * Com o Trigger.dev configurado, é ele quem executa — com retry, timeout e
 * observabilidade. Sem ele (dev local), roda em background no próprio
 * processo: útil para desenvolver, mas não sobrevive a um restart. É
 * exatamente para esse caso que `job_runs` guarda o estado.
 */
export async function dispatchAnalyzeProduct(
  payload: AnalyzeProductPayload,
): Promise<{ mode: 'trigger' | 'inline' }> {
  if (process.env.TRIGGER_SECRET_KEY) {
    await analyzeProductTask.trigger(payload, { idempotencyKey: idempotencyKeyFor(payload) })
    return { mode: 'trigger' }
  }

  void runInline(payload)
  return { mode: 'inline' }
}

async function runInline(payload: AnalyzeProductPayload): Promise<void> {
  const claim = await claimJobRun({
    taskName: 'analyze-product',
    idempotencyKey: idempotencyKeyFor(payload),
    productId: payload.productId,
    payload: { ...payload, runner: 'inline' },
  })
  if (!claim) return

  try {
    const outcome = await analyzeProduct({ ...payload, jobRunId: claim.id })
    await finishJobRun(claim.id, 'completed', { result: { ...outcome } })
  } catch (error) {
    await finishJobRun(claim.id, 'failed', { error })
    console.error('[analyze-product] falhou em execução inline', error)
  }
}
