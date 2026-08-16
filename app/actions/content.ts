'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/server/guard'
import { dispatchPlanContentWeek } from '@/server/jobs'
import { deriveSegments } from '@/modules/audiences'
import { approvePost, rejectPost, editPost, rejectIdea } from '@/modules/content'

export interface ActionState {
  error?: string
  success?: string
}

// --- Audiências ----------------------------------------------------------
// Ação simples (sem useActionState) — retorna void

export async function deriveSegmentsAction(formData: FormData): Promise<void> {
  await requireUser()
  const productId = String(formData.get('productId') ?? '')
  if (!productId) return

  await deriveSegments({ productId })
  revalidatePath(`/products/${productId}/audiences`)
}

// --- Planejamento da semana ---------------------------------------------

export async function planWeekAction(formData: FormData): Promise<void> {
  await requireUser()
  const productId = String(formData.get('productId') ?? '')
  const campaignId = String(formData.get('campaignId') ?? '') || undefined
  if (!productId) return

  await dispatchPlanContentWeek({ productId, campaignId })
  revalidatePath(`/products/${productId}/content`)
}

// --- Aprovação / rejeição de posts (usadas com useActionState) ----------
// Assinatura: (prevState, formData) conforme o contrato do useActionState

export async function approvePostAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireUser()
  const productId = String(formData.get('productId') ?? '')
  const postId = String(formData.get('postId') ?? '')
  if (!productId || !postId) return { error: 'Parâmetros ausentes.' }

  try {
    await approvePost({ postId, productId })
    revalidatePath(`/products/${productId}/content`)
    return { success: 'Post aprovado.' }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao aprovar post.'
    return { error: message }
  }
}

export async function rejectPostAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireUser()
  const productId = String(formData.get('productId') ?? '')
  const postId = String(formData.get('postId') ?? '')
  const reason = String(formData.get('reason') ?? '').trim()

  if (!productId || !postId) return { error: 'Parâmetros ausentes.' }
  if (!reason) return { error: 'Motivo de rejeição é obrigatório.' }

  try {
    await rejectPost({ postId, productId, reason })
    revalidatePath(`/products/${productId}/content`)
    return { success: 'Post rejeitado.' }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao rejeitar post.'
    return { error: message }
  }
}

export async function editPostBodyAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireUser()
  const productId = String(formData.get('productId') ?? '')
  const postId = String(formData.get('postId') ?? '')
  const hook = formData.get('hook') !== null ? String(formData.get('hook')) : undefined
  const body = formData.get('body') !== null ? String(formData.get('body')) : undefined
  const cta = formData.get('cta') !== null ? String(formData.get('cta')) || null : undefined

  if (!productId || !postId) return { error: 'Parâmetros ausentes.' }

  try {
    await editPost({ postId, productId, hook, body, cta })
    revalidatePath(`/products/${productId}/content`)
    return { success: 'Post atualizado.' }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao atualizar post.'
    return { error: message }
  }
}

export async function rejectIdeaAction(formData: FormData): Promise<void> {
  await requireUser()
  const productId = String(formData.get('productId') ?? '')
  const ideaId = String(formData.get('ideaId') ?? '')
  const reason = String(formData.get('reason') ?? '').trim()

  if (!productId || !ideaId || !reason) return

  await rejectIdea({ ideaId, productId, reason })
  revalidatePath(`/products/${productId}/content`)
}
