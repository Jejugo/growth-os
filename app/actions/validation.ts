'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireUser } from '@/server/guard'
import {
  dispatchGenerateValidationContent,
  dispatchGenerateMoreValidationContent,
  dispatchConcludeValidation,
  dispatchGenerateLandingPage,
  startCustomLandingDraftFromZip,
  requestLandingDraftRevision,
  dispatchPublishLandingDraft,
} from '@/server/jobs'
import {
  createIdeaProduct,
  startValidation,
  abortRunningValidation,
  requestMoreValidationContent,
  CooldownActiveError,
  markLaunched,
  recordManualSignal,
  rewriteValidationPost,
  ValidationStateError,
  InvalidStageTransitionError,
  RewriteNotAllowedError,
} from '@/modules/validation'
import { InvalidUrlError } from '@/modules/products'
import { listValidationChannels } from '@/modules/distribution'

export interface ActionState {
  error?: string
  success?: string
}

// --- Criação de ideia --------------------------------------------------------

export async function createIdeaProductAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireUser()

  const name = String(formData.get('name') ?? '').trim()
  const problem = String(formData.get('problem') ?? '').trim()
  const audience = String(formData.get('audience') ?? '').trim()
  const solutionSketch = String(formData.get('solutionSketch') ?? '').trim()
  const whyNow = String(formData.get('whyNow') ?? '').trim() || null
  const alternatives = String(formData.get('alternatives') ?? '').trim() || null
  const riskiestAssumption = String(formData.get('riskiestAssumption') ?? '').trim()

  if (!name || !problem || !audience || !solutionSketch || !riskiestAssumption) {
    return { error: 'Nome, problema, audiência, esboço de solução e hipótese mais arriscada são obrigatórios.' }
  }

  let productId: string
  try {
    const { product } = await createIdeaProduct({
      name,
      brief: { problem, audience, solutionSketch, whyNow, alternatives, riskiestAssumption },
    })
    productId = product.id
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Não foi possível cadastrar a ideia.' }
  }

  revalidatePath('/products')
  redirect(`/products/${productId}/validation`)
}

// --- Validação ----------------------------------------------------------------

export async function startValidationAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireUser()

  const productId = String(formData.get('productId') ?? '')
  const landingUrl = String(formData.get('landingUrl') ?? '').trim()
  const windowDays = Number(formData.get('windowDays') ?? 14)
  const minVisitors = Number(formData.get('minVisitors') ?? 300)
  const minSignups = Number(formData.get('minSignups') ?? 100)
  const minSignupRatePct = Number(formData.get('minSignupRatePct') ?? 4)
  const minStrongSignals = Number(formData.get('minStrongSignals') ?? 5)

  if (!productId || !landingUrl) return { error: 'Landing page é obrigatória.' }

  if ((await listValidationChannels(productId)).length === 0) {
    return {
      error: 'Nenhum canal com política ativa. Configure pelo menos um canal em Canais antes de iniciar a validação.',
    }
  }

  let validationId: string
  try {
    const validation = await startValidation({
      productId,
      landingUrl,
      windowDays,
      minVisitors,
      minSignups,
      minSignupRate: minSignupRatePct / 100,
      minStrongSignals,
    })
    validationId = validation.id
  } catch (error) {
    if (error instanceof InvalidUrlError) return { error: error.message }
    if (error instanceof ValidationStateError) return { error: error.message }
    if (error instanceof InvalidStageTransitionError) return { error: error.message }
    return { error: 'Não foi possível iniciar a validação.' }
  }

  await dispatchGenerateValidationContent({ validationId })

  revalidatePath(`/products/${productId}/validation`)
  revalidatePath(`/products/${productId}`)
  return { success: 'Validação iniciada. Gerando o primeiro lote de conteúdo…' }
}

/**
 * Dispara a geração+deploy da landing automática — assíncrono, a UI faz polling do resultado.
 * Com `adjustmentNote` preenchido, revisa a copy já publicada em vez de escrever do zero.
 */
export async function generateLandingPageAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireUser()

  const productId = String(formData.get('productId') ?? '')
  if (!productId) return { error: 'Produto inválido.' }

  const adjustmentNote = String(formData.get('adjustmentNote') ?? '').trim() || undefined

  const result = await dispatchGenerateLandingPage(productId, adjustmentNote)
  if ('error' in result) return { error: result.error }

  revalidatePath(`/products/${productId}/validation`)
  revalidatePath(`/products/${productId}/landing`)
  return {
    success: adjustmentNote
      ? 'Revisando a landing com base no seu pedido — isso pode levar até 1 minuto.'
      : 'Gerando landing page — isso pode levar até 1 minuto.',
  }
}

/**
 * Recebe um .zip de HTML/CSS/JS feito numa ferramenta externa e cria (ou substitui) o rascunho —
 * síncrono, sem deploy nenhum. O preview lê o rascunho na hora; publicar é uma ação separada
 * (`publishLandingDraftAction`).
 */
export async function uploadCustomLandingDraftAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireUser()

  const productId = String(formData.get('productId') ?? '')
  if (!productId) return { error: 'Produto inválido.' }

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Selecione um arquivo .zip.' }
  }

  const zipBuffer = Buffer.from(await file.arrayBuffer())
  const result = await startCustomLandingDraftFromZip(productId, zipBuffer)

  if ('error' in result) return { error: result.error }

  revalidatePath(`/products/${productId}/landing`)
  return { success: 'Rascunho pronto — veja o preview e publique quando estiver bom.' }
}

/**
 * Pede pra IA ajustar o rascunho (vendo o histórico inteiro da sessão) — síncrono, atualiza o
 * preview na hora, sem publicar nada.
 */
export async function reviseLandingDraftAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireUser()

  const productId = String(formData.get('productId') ?? '')
  if (!productId) return { error: 'Produto inválido.' }

  const note = String(formData.get('note') ?? '').trim()
  if (!note) return { error: 'Descreva o que precisa ser ajustado.' }

  const result = await requestLandingDraftRevision(productId, note)
  if ('error' in result) return { error: result.error }

  revalidatePath(`/products/${productId}/landing`)
  return { success: 'Rascunho ajustado.' }
}

/** Publica o rascunho atual de verdade na Vercel — assíncrono, a UI faz polling do resultado. */
export async function publishLandingDraftAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireUser()

  const productId = String(formData.get('productId') ?? '')
  if (!productId) return { error: 'Produto inválido.' }

  const result = await dispatchPublishLandingDraft(productId)
  if ('error' in result) return { error: result.error }

  revalidatePath(`/products/${productId}/validation`)
  revalidatePath(`/products/${productId}/landing`)
  return { success: 'Publicando — isso leva alguns segundos.' }
}

export async function abortValidationAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireUser()
  const productId = String(formData.get('productId') ?? '')
  const reason = String(formData.get('reason') ?? '').trim()

  if (!productId || !reason) return { error: 'Motivo é obrigatório para abortar.' }

  try {
    await abortRunningValidation(productId, reason)
  } catch (error) {
    if (error instanceof ValidationStateError) return { error: error.message }
    return { error: 'Não foi possível abortar a validação.' }
  }

  revalidatePath(`/products/${productId}/validation`)
  return { success: 'Validação abortada.' }
}

export async function generateMoreValidationContentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireUser()
  const productId = String(formData.get('productId') ?? '')
  if (!productId) return { error: 'Produto inválido.' }

  if ((await listValidationChannels(productId)).length === 0) {
    return {
      error: 'Nenhum canal com política ativa. Configure pelo menos um canal em Canais antes de gerar mais posts.',
    }
  }

  let validationId: string
  try {
    ;({ validationId } = await requestMoreValidationContent(productId))
  } catch (error) {
    if (error instanceof CooldownActiveError) return { error: error.message }
    if (error instanceof ValidationStateError) return { error: error.message }
    return { error: 'Não foi possível gerar mais posts.' }
  }

  await dispatchGenerateMoreValidationContent({ validationId })

  revalidatePath(`/products/${productId}/content`)
  revalidatePath(`/products/${productId}/validation`)
  return { success: 'Gerando mais um lote de posts…' }
}

export async function rewriteValidationPostAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireUser()

  const productId = String(formData.get('productId') ?? '')
  const postId = String(formData.get('postId') ?? '')
  if (!postId) return { error: 'Post inválido.' }

  try {
    await rewriteValidationPost(postId)
  } catch (error) {
    if (error instanceof RewriteNotAllowedError) return { error: error.message }
    return { error: 'Não foi possível reformular o post.' }
  }

  revalidatePath(`/products/${productId}/content`)
  return { success: 'Post reformulado.' }
}

export async function concludeDueValidationsAction(): Promise<void> {
  await requireUser()
  await dispatchConcludeValidation()
}

export async function recordSignalAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireUser()

  const productId = String(formData.get('productId') ?? '')
  const kind = String(formData.get('kind') ?? '')
  const note = String(formData.get('note') ?? '').trim() || undefined

  if (!productId || (kind !== 'activation' && kind !== 'paid')) {
    return { error: 'Parâmetros inválidos.' }
  }

  await recordManualSignal({ productId, kind, note })
  revalidatePath(`/products/${productId}/validation`)
  return { success: 'Sinal registrado.' }
}

// --- Lançamento -----------------------------------------------------------

export async function markLaunchedAction(formData: FormData): Promise<void> {
  await requireUser()
  const productId = String(formData.get('productId') ?? '')
  if (!productId) return

  try {
    await markLaunched(productId)
  } catch {
    // Transição inválida (ex.: clicou fora de 'building') — o botão só
    // aparece quando o estágio já é 'building', então isto é defensivo.
  }

  revalidatePath(`/products/${productId}`)
}
