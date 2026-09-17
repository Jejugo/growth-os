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

export async function approvePostsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireUser()
  const productId = String(formData.get('productId') ?? '')
  const postIds = [...new Set(formData.getAll('postId').map(String).filter(Boolean))]

  if (!productId) return { error: 'Produto ausente.' }
  if (postIds.length === 0) return { error: 'Selecione ao menos um post.' }
  if (postIds.length > 50) return { error: 'Aprove no máximo 50 posts por vez.' }

  let approved = 0
  const failures: string[] = []

  for (const postId of postIds) {
    try {
      await approvePost({ postId, productId })
      approved += 1
    } catch (error) {
      failures.push(error instanceof Error ? error.message : `Falha ao aprovar ${postId}.`)
    }
  }

  revalidatePath(`/products/${productId}/content`)

  if (failures.length > 0) {
    return {
      error: `${approved} aprovado(s); ${failures.length} não aprovado(s). ${failures[0]}`,
    }
  }

  return { success: `${approved} post${approved === 1 ? '' : 's'} aprovado${approved === 1 ? '' : 's'}.` }
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
  // linkUrl: 'on' = inclui link do produto; '' = remove link; ausente = sem alteração
  const linkUrlRaw = formData.get('linkUrl')
  const linkUrl = linkUrlRaw !== null ? (String(linkUrlRaw) || null) : undefined

  if (!productId || !postId) return { error: 'Parâmetros ausentes.' }

  try {
    await editPost({ postId, productId, hook, body, cta, linkUrl })
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
