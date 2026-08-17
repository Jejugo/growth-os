import { notFound } from 'next/navigation'
import { requireUser } from '@/server/guard'
import { findProduct } from '@/modules/products/repo'
import { db } from '@/lib/db'
import { eq, desc } from 'drizzle-orm'
import { experiments, experimentVariants } from '@/modules/content/schema'
import { ProductNav } from '../_components/product-nav'
import { ExperimentsClient } from './_components/experiments-client'

export const dynamic = 'force-dynamic'

export default async function ExperimentsPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser()
  const { id } = await params

  const product = await findProduct(id)
  if (!product) notFound()

  const allExperiments = await db
    .select()
    .from(experiments)
    .where(eq(experiments.productId, id))
    .orderBy(desc(experiments.createdAt))

  // Carrega variantes para cada experimento
  const withVariants = await Promise.all(
    allExperiments.map(async (exp) => {
      const variants = await db
        .select()
        .from(experimentVariants)
        .where(eq(experimentVariants.experimentId, exp.id))
        .orderBy(experimentVariants.label)
      return { ...exp, variants }
    }),
  )

  return (
    <div className="space-y-8">
      <div className="border-line border-b pb-4">
        <h1 className="text-xl font-semibold">{product.name}</h1>
      </div>

      <ProductNav productId={id} active="experiments" />

      <ExperimentsClient productId={id} experiments={withVariants} />
    </div>
  )
}
