'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireUser } from '@/server/guard'
import {
  dispatchGenerateValidationContent,
  dispatchConcludeValidation,
  dispatchGenerateLandingPage,
} from '@/server/jobs'
import {
  createIdeaProduct,
  startValidation,
  abortRunningValidation,
  markLaunched,
  recordManualSignal,
  rewriteValidationPost,
  ValidationStateError,
  InvalidStageTransitionError,
  RewriteNotAllowedError,
} from '@/modules/validation'
import { InvalidUrlError } from '@/modules/products'

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

/** Dispara a geração+deploy da landing automática — assíncrono, a UI faz polling do resultado. */
export async function generateLandingPageAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireUser()

  const productId = String(formData.get('productId') ?? '')
  if (!productId) return { error: 'Produto inválido.' }

  await dispatchGenerateLandingPage(productId)

  revalidatePath(`/products/${productId}/validation`)
  return { success: 'Gerando landing page — isso pode levar até 1 minuto.' }
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
