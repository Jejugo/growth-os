import { notFound } from 'next/navigation'
import { requireUser } from '@/server/guard'
import { findProduct } from '@/modules/products'
import {
  findLatestBrief,
  findRunningValidation,
  listValidations,
  getValidationMetrics,
  getVariantPerformance,
} from '@/modules/validation'
import { listExperimentVariants } from '@/modules/content'
import { ProductNav } from '../_components/product-nav'
import { ValidationClient } from './_components/validation-client'

export const dynamic = 'force-dynamic'

export default async function ValidationPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser()
  const { id } = await params

  const product = await findProduct(id)
  if (!product) notFound()

  const [brief, running, history] = await Promise.all([
    findLatestBrief(id),
    findRunningValidation(id),
    listValidations(id),
  ])

  let liveMetrics: { visitors: number; signups: number; activations: number; paid: number } | null = null
  let variants: Array<{
    variantId: string
    label: string
    name: string
    description: string | null
    clicks: number
    signups: number
    activations: number
    paid: number
  }> = []

  if (running) {
    liveMetrics = await getValidationMetrics(id, running.startedAt ?? running.createdAt, new Date())

    if (running.experimentId) {
      const [experimentVariants, performance] = await Promise.all([
        listExperimentVariants(running.experimentId),
        getVariantPerformance(running.experimentId),
      ])
      const perfById = new Map(performance.map((p) => [p.variantId, p]))
      variants = experimentVariants.map((v) => ({
        variantId: v.id,
        label: v.label,
        name: v.name,
        description: v.description,
        clicks: perfById.get(v.id)?.clicks ?? 0,
        signups: perfById.get(v.id)?.signups ?? 0,
        activations: perfById.get(v.id)?.activations ?? 0,
        paid: perfById.get(v.id)?.paid ?? 0,
      }))
    }
  }

  return (
    <div className="space-y-8">
      <div className="border-line border-b pb-4">
        <h1 className="text-xl font-semibold">{product.name}</h1>
      </div>

      <ProductNav productId={id} active="validation" />

      <ValidationClient
        productId={id}
        stage={product.stage}
        brief={brief ?? null}
        running={running ?? null}
        history={history}
        liveMetrics={liveMetrics}
        variants={variants}
      />
    </div>
  )
}
