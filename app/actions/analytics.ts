'use server'

import { revalidatePath } from 'next/cache'
import { dismissLearning } from '@/modules/analytics'
import { db } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import { experiments, experimentVariants } from '@/modules/content/schema'

// --- Aprendizados -----------------------------------------------------------

export async function dismissLearningAction(
  _prevState: { error?: string; success?: string },
  formData: FormData,
) {
  const id = String(formData.get('id') ?? '')
  const productId = String(formData.get('productId') ?? '')

  if (!id || !productId) return { error: 'Parâmetros ausentes.' }

  try {
    await dismissLearning(id, productId)
    revalidatePath(`/products/${productId}/insights`)
    return { success: 'Aprendizado descartado.' }
  } catch {
    return { error: 'Falha ao descartar aprendizado.' }
  }
}

// --- Experimentos -----------------------------------------------------------

export async function createExperimentAction(
  _prevState: { error?: string; success?: string; experimentId?: string },
  formData: FormData,
) {
  const productId = String(formData.get('productId') ?? '')
  const name = String(formData.get('name') ?? '').trim()
  const hypothesis = String(formData.get('hypothesis') ?? '').trim()
  const dimension = String(formData.get('dimension') ?? 'angle')
  const primaryMetric = String(formData.get('primaryMetric') ?? 'signup')
  const minSample = Number(formData.get('minSamplePerVariant') ?? 100)

  if (!productId || !name) return { error: 'Nome é obrigatório.' }

  try {
    const [exp] = await db
      .insert(experiments)
      .values({
        productId,
        name,
        hypothesis: hypothesis || null,
        dimension,
        primaryMetric,
        minSamplePerVariant: minSample,
        status: 'draft',
      })
      .returning()

    // Cria variantes A/B padrão
    await db.insert(experimentVariants).values([
      {
        experimentId: exp!.id,
        label: 'A',
        name: 'Controle',
        isControl: true,
        spec: {},
      },
      {
        experimentId: exp!.id,
        label: 'B',
        name: 'Variante',
        isControl: false,
        spec: {},
      },
    ])

    revalidatePath(`/products/${productId}/experiments`)
    return { success: 'Experimento criado.', experimentId: exp!.id }
  } catch {
    return { error: 'Falha ao criar experimento.' }
  }
}

export async function startExperimentAction(
  _prevState: { error?: string; success?: string },
  formData: FormData,
) {
  const id = String(formData.get('id') ?? '')
  const productId = String(formData.get('productId') ?? '')

  if (!id || !productId) return { error: 'Parâmetros ausentes.' }

  try {
    await db
      .update(experiments)
      .set({ status: 'running', startedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(experiments.id, id), eq(experiments.productId, productId)))

    revalidatePath(`/products/${productId}/experiments`)
    return { success: 'Experimento iniciado.' }
  } catch {
    return { error: 'Falha ao iniciar experimento.' }
  }
}

export async function abandonExperimentAction(
  _prevState: { error?: string; success?: string },
  formData: FormData,
) {
  const id = String(formData.get('id') ?? '')
  const productId = String(formData.get('productId') ?? '')

  if (!id || !productId) return { error: 'Parâmetros ausentes.' }

  try {
    await db
      .update(experiments)
      .set({ status: 'abandoned', endedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(experiments.id, id), eq(experiments.productId, productId)))

    revalidatePath(`/products/${productId}/experiments`)
    return { success: 'Experimento abandonado.' }
  } catch {
    return { error: 'Falha ao abandonar experimento.' }
  }
}
