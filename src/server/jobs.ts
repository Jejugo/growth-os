import { analyzeProductTask, idempotencyKeyFor, type AnalyzeProductPayload } from '@/trigger/analyze-product'
import {
  planContentWeekTask,
  idempotencyKeyFor as planWeekKey,
  type PlanContentWeekPayload,
} from '@/trigger/plan-content-week'
import { publishPostTask, type PublishPostPayload } from '@/trigger/publish-post'
import { reconcilePublicationsTask } from '@/trigger/reconcile-publications'
import { growthTickTask, type GrowthTickPayload } from '@/trigger/growth-tick'
import {
  generateValidationContentTask,
  idempotencyKeyFor as validationContentKey,
  type GenerateValidationContentPayload,
} from '@/trigger/generate-validation-content'
import { concludeValidationTask } from '@/trigger/conclude-validation'
import { analyzeProduct } from '@/modules/products'
import { concludeValidationById } from '@/modules/validation'
import { runPublisher } from '@/modules/distribution/publisher'
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

// --- Planejamento de semana de conteúdo ---------------------------------

export async function dispatchPlanContentWeek(
  payload: PlanContentWeekPayload,
): Promise<{ mode: 'trigger' | 'inline' }> {
  if (process.env.TRIGGER_SECRET_KEY) {
    await planContentWeekTask.trigger(payload, { idempotencyKey: planWeekKey(payload) })
    return { mode: 'trigger' }
  }

  void runPlanInline(payload)
  return { mode: 'inline' }
}

async function runPlanInline(payload: PlanContentWeekPayload): Promise<void> {
  const { runContentWeekPipeline } = await import('@/trigger/plan-content-week')
  const key = planWeekKey(payload)
  const claim = await claimJobRun({
    taskName: 'plan-content-week',
    idempotencyKey: key,
    productId: payload.productId,
    payload: { ...payload, runner: 'inline' },
  })
  if (!claim) return

  try {
    const outcome = await runContentWeekPipeline(payload, claim.id)
    await finishJobRun(claim.id, 'completed', { result: { ...outcome } })
  } catch (error) {
    await finishJobRun(claim.id, 'failed', { error })
    console.error('[plan-content-week] falhou em execução inline', error)
  }
}

// --- Publicação de post -------------------------------------------------

export async function dispatchPublishPost(
  payload: PublishPostPayload,
): Promise<{ mode: 'trigger' | 'inline' }> {
  if (process.env.TRIGGER_SECRET_KEY) {
    await publishPostTask.trigger(payload)
    return { mode: 'trigger' }
  }

  void runPublishInline(payload)
  return { mode: 'inline' }
}

async function runPublishInline(payload: PublishPostPayload): Promise<void> {
  try {
    await runPublisher(payload.publicationId)
  } catch (error) {
    console.error('[publish-post] falhou em execução inline', error)
  }
}

// --- Reconciliação de publicações desconhecidas -------------------------

export async function dispatchReconcilePublications(): Promise<{ mode: 'trigger' | 'inline' }> {
  if (process.env.TRIGGER_SECRET_KEY) {
    await reconcilePublicationsTask.trigger({} as Record<string, never>)
    return { mode: 'trigger' }
  }

  void (async () => {
    const { reconcilePublicationsTask: t } = await import('@/trigger/reconcile-publications')
    console.log('[reconcile] iniciando inline')
  })()
  return { mode: 'inline' }
}

// --- Geração de conteúdo de validação (fase 4.5) -------------------------

export async function dispatchGenerateValidationContent(
  payload: GenerateValidationContentPayload,
): Promise<{ mode: 'trigger' | 'inline' }> {
  if (process.env.TRIGGER_SECRET_KEY) {
    await generateValidationContentTask.trigger(payload, {
      idempotencyKey: validationContentKey(payload),
    })
    return { mode: 'trigger' }
  }

  void runGenerateValidationContentInline(payload)
  return { mode: 'inline' }
}

async function runGenerateValidationContentInline(
  payload: GenerateValidationContentPayload,
): Promise<void> {
  const key = validationContentKey(payload)
  const claim = await claimJobRun({
    taskName: 'generate-validation-content',
    idempotencyKey: key,
    payload: { ...payload, runner: 'inline' },
  })
  if (!claim) return

  try {
    const { runGenerateValidationContentPipeline } = await import(
      '@/trigger/generate-validation-content'
    )
    const result = await runGenerateValidationContentPipeline(payload, claim.id)
    await finishJobRun(claim.id, 'completed', { result: { ...result } })
  } catch (error) {
    await finishJobRun(claim.id, 'failed', { error })
    console.error('[generate-validation-content] falhou em execução inline', error)
  }
}

/** Dispara o fechamento de UMA validação vencida (usado pelo botão manual "concluir agora"). */
export async function dispatchConcludeValidation(): Promise<{ mode: 'trigger' | 'inline' }> {
  if (process.env.TRIGGER_SECRET_KEY) {
    await concludeValidationTask.trigger(undefined)
    return { mode: 'trigger' }
  }

  void (async () => {
    const { findDueValidations } = await import('@/modules/validation')
    const due = await findDueValidations(new Date())
    for (const v of due) await concludeValidationById(v.id)
  })()
  return { mode: 'inline' }
}

// --- Growth tick (agendador) --------------------------------------------

export async function dispatchGrowthTick(
  payload: GrowthTickPayload,
): Promise<{ mode: 'trigger' | 'inline' }> {
  if (process.env.TRIGGER_SECRET_KEY) {
    await growthTickTask.trigger(payload)
    return { mode: 'trigger' }
  }

  // Dev: não executa inline o tick pois cria publicações reais
  console.info('[growth-tick] Trigger.dev não configurado — tick ignorado em dev.')
  return { mode: 'inline' }
}
