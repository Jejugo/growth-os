'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireUser } from '@/server/guard'
import { dispatchAnalyzeProduct } from '@/server/jobs'
import {
  registerProduct,
  editProfileField,
  unlockProfileField,
  deleteProduct,
  isEditableField,
  ProductAlreadyExistsError,
  InvalidUrlError,
  DATA_FIELDS,
} from '@/modules/products'

export interface ActionState {
  error?: string
}

export async function createProductAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireUser()

  const raw = String(formData.get('url') ?? '')
  let productId: string

  try {
    const product = await registerProduct(raw)
    productId = product.id
  } catch (error) {
    if (error instanceof ProductAlreadyExistsError) {
      redirect(`/products/${error.productId}`)
    }
    if (error instanceof InvalidUrlError) return { error: error.message }
    return { error: 'Não foi possível cadastrar o produto. Verifique a URL.' }
  }

  // Dispara e volta: a análise leva minutos, a resposta da UI não pode esperar.
  await dispatchAnalyzeProduct({ productId })
  revalidatePath('/products')
  redirect(`/products/${productId}`)
}

export async function reanalyzeAction(formData: FormData): Promise<void> {
  await requireUser()
  const productId = String(formData.get('productId') ?? '')
  if (!productId) return

  await dispatchAnalyzeProduct({ productId, force: true })
  revalidatePath(`/products/${productId}`)
}

export async function editFieldAction(formData: FormData): Promise<void> {
  await requireUser()

  const productId = String(formData.get('productId') ?? '')
  const field = String(formData.get('field') ?? '')
  const raw = String(formData.get('value') ?? '')

  if (!productId || !isEditableField(field)) return

  // Campos de lista chegam como uma linha por item.
  const isList = (DATA_FIELDS as readonly string[]).includes(field) && field !== 'tagline'
  const value = isList
    ? raw
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
    : raw.trim() || null

  // `pricingTiers` é estruturado e não tem edição textual nesta fase.
  if (field === 'pricingTiers') return

  await editProfileField({ productId, field, value })
  revalidatePath(`/products/${productId}`)
}

export async function deleteProductAction(formData: FormData): Promise<void> {
  await requireUser()
  const productId = String(formData.get('productId') ?? '')
  if (!productId) return
  await deleteProduct(productId)
  revalidatePath('/products')
  redirect('/products')
}

export async function unlockFieldAction(formData: FormData): Promise<void> {
  await requireUser()

  const productId = String(formData.get('productId') ?? '')
  const field = String(formData.get('field') ?? '')
  if (!productId || !isEditableField(field)) return

  await unlockProfileField({ productId, field })
  revalidatePath(`/products/${productId}`)
}
