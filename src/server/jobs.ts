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
import {
  autoApproveValidationPostsTask,
  runAutoApproveValidationPosts,
} from '@/trigger/auto-approve-validation-posts'
import {
  generateLandingPageTask,
  newLandingPageRunKey,
  type GenerateLandingPagePayload,
} from '@/trigger/generate-landing-page'
import {
  publishLandingDraftTask,
  newPublishLandingDraftRunKey,
  type PublishLandingDraftPayload,
} from '@/trigger/publish-landing-draft'
import { analyzeProduct } from '@/modules/products'
import {
  concludeValidationById,
  generateLandingPage,
  startLandingPageGeneration,
  startCustomLandingUpload,
  publishLandingDraft,
  startCustomLandingDraft,
  reviseLandingDraft,
  parseCustomLandingZip,
  CustomLandingUploadError,
  CustomLandingTooLargeError,
  findLatestReadyLandingPage,
  findLandingPageDraft,
  type LandingPageCopy,
} from '@/modules/validation'
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

// --- Auto-aprovação de posts de validação (fase 4.5) -----------------------

export async function dispatchAutoApproveValidationPosts(
  productId: string,
): Promise<{ mode: 'trigger' | 'inline' }> {
  if (process.env.TRIGGER_SECRET_KEY) {
    await autoApproveValidationPostsTask.trigger({ productId })
    return { mode: 'trigger' }
  }

  void runAutoApproveValidationPostsInline(productId)
  return { mode: 'inline' }
}

async function runAutoApproveValidationPostsInline(productId: string): Promise<void> {
  try {
    const result = await runAutoApproveValidationPosts({ productId })
    console.info('[auto-approve-validation-posts] concluído inline', result)
  } catch (error) {
    console.error('[auto-approve-validation-posts] falhou em execução inline', error)
  }
}

// --- Geração de landing page automática (fase 4.5) --------------------------

/**
 * Cada chamada é uma tentativa independente — `runKey` novo a cada dispatch,
 * não por produto. A linha `generating` é criada aqui, SÍNCRONA e aguardada
 * (`startLandingPageGeneration`), antes de disparar o trabalho pesado em
 * background — sem isso, a página que chamou essa action poderia revalidar
 * e reler o banco antes de qualquer linha nova existir, e o polling da UI
 * nunca chegaria a ver o estado "generating" (nada mudaria pra disparar o
 * próximo refresh).
 */
export async function dispatchGenerateLandingPage(
  productId: string,
  /** Presente quando o fundador pediu ajustes numa landing já publicada, em vez de gerar do zero. */
  adjustmentNote?: string,
): Promise<{ mode: 'trigger' | 'inline' } | { error: string }> {
  // Busca a copy anterior ANTES de criar a nova linha `generating` — depois disso,
  // `findLatestReadyLandingPage` passaria a devolver a linha nova (vazia), não a que o fundador
  // está pedindo pra ajustar. Usa `Ready`, não `findLatestLandingPage`: se a última tentativa foi
  // um ajuste que falhou, a mais recente não tem copy nenhuma — sem isso, tentar de novo depois de
  // uma falha perderia silenciosamente o pedido de ajuste e regeraria do zero.
  let previousCopy: LandingPageCopy | undefined
  if (adjustmentNote) {
    previousCopy = (await findLatestReadyLandingPage(productId))?.copy ?? undefined
    if (!previousCopy) {
      return { error: 'Nenhuma landing gerada por IA encontrada pra ajustar — gere uma primeiro.' }
    }
  }

  const landingPage = await startLandingPageGeneration(productId)
  const runKey = newLandingPageRunKey()
  const adjustment = adjustmentNote && previousCopy ? { previousCopy, note: adjustmentNote } : undefined

  if (process.env.TRIGGER_SECRET_KEY) {
    await generateLandingPageTask.trigger(
      { productId, runKey, landingPageId: landingPage.id, adjustment },
      { idempotencyKey: `generate-landing-page:${runKey}` },
    )
    return { mode: 'trigger' }
  }

  void runGenerateLandingPageInline({ productId, runKey, landingPageId: landingPage.id, adjustment }, landingPage)
  return { mode: 'inline' }
}

async function runGenerateLandingPageInline(
  payload: GenerateLandingPagePayload,
  landingPage: Awaited<ReturnType<typeof startLandingPageGeneration>>,
): Promise<void> {
  const key = `generate-landing-page:${payload.runKey}`
  const claim = await claimJobRun({
    taskName: 'generate-landing-page',
    idempotencyKey: key,
    productId: payload.productId,
    payload: { ...payload, runner: 'inline' },
  })
  if (!claim) return

  try {
    const result = await generateLandingPage(landingPage, payload.adjustment)
    await finishJobRun(claim.id, 'completed', { result: { ...result } })
  } catch (error) {
    await finishJobRun(claim.id, 'failed', { error })
    console.error('[generate-landing-page] falhou em execução inline', error)
  }
}

/**
 * Valida o zip e substitui o rascunho — síncrono, sem deploy nenhum (por isso não precisa do
 * fluxo `generating` → poll: não há nada lento aqui, só parse + escrita no banco). O preview lê o
 * rascunho direto de `/api/landing-drafts`; publicar de verdade é `dispatchPublishLandingDraft`.
 */
export async function startCustomLandingDraftFromZip(
  productId: string,
  zipBuffer: Buffer,
): Promise<{ ok: true } | { error: string }> {
  let files: Array<{ file: string; data: string }>
  try {
    files = await parseCustomLandingZip(zipBuffer)
  } catch (error) {
    if (error instanceof CustomLandingUploadError) return { error: error.message }
    throw error
  }

  await startCustomLandingDraft(productId, files)
  return { ok: true }
}

/**
 * Pede um ajuste no rascunho — síncrono (só uma chamada de IA de alguns segundos, sem deploy),
 * mesmo motivo de `startCustomLandingDraftFromZip` não precisar do fluxo `generating` → poll.
 */
export async function requestLandingDraftRevision(
  productId: string,
  note: string,
): Promise<{ ok: true } | { error: string }> {
  try {
    await reviseLandingDraft(productId, note)
    return { ok: true }
  } catch (error) {
    if (error instanceof CustomLandingTooLargeError) return { error: error.message }
    throw error
  }
}

/**
 * Publica o rascunho atual — esta sim é a parte lenta (deploy de verdade na Vercel), então segue o
 * mesmo padrão `generating` → poll de todo o resto. A linha `generating` é criada aqui, síncrona,
 * antes de disparar o trabalho em background — mesmo motivo de `dispatchGenerateLandingPage`.
 */
export async function dispatchPublishLandingDraft(
  productId: string,
): Promise<{ mode: 'trigger' | 'inline' } | { error: string }> {
  const draft = await findLandingPageDraft(productId)
  if (!draft) return { error: 'Nenhum rascunho de landing pra publicar — envie um zip primeiro.' }

  const landingPage = await startCustomLandingUpload(productId)
  const runKey = newPublishLandingDraftRunKey()

  if (process.env.TRIGGER_SECRET_KEY) {
    await publishLandingDraftTask.trigger(
      { productId, runKey, landingPageId: landingPage.id },
      { idempotencyKey: `publish-landing-draft:${runKey}` },
    )
    return { mode: 'trigger' }
  }

  void runPublishLandingDraftInline({ productId, runKey, landingPageId: landingPage.id }, landingPage)
  return { mode: 'inline' }
}

async function runPublishLandingDraftInline(
  payload: PublishLandingDraftPayload,
  landingPage: Awaited<ReturnType<typeof startCustomLandingUpload>>,
): Promise<void> {
  const key = `publish-landing-draft:${payload.runKey}`
  const claim = await claimJobRun({
    taskName: 'publish-landing-draft',
    idempotencyKey: key,
    productId: payload.productId,
    payload: { productId: payload.productId, landingPageId: payload.landingPageId, runKey: payload.runKey, runner: 'inline' },
  })
  if (!claim) return

  try {
    const result = await publishLandingDraft(landingPage)
    await finishJobRun(claim.id, 'completed', { result: { ...result } })
  } catch (error) {
    await finishJobRun(claim.id, 'failed', { error })
    console.error('[publish-landing-draft] falhou em execução inline', error)
  }
}
