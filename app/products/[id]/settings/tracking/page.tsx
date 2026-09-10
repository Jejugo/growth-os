import { notFound } from 'next/navigation'
import { requireUser } from '@/server/guard'
import { findProduct } from '@/modules/products/repo'
import { listIngestKeys } from '@/modules/attribution/repo'
import { TrackingPageClient } from './_components/tracking-page-client'
import type { IngestKey } from '@/modules/attribution/schema'

export const dynamic = 'force-dynamic'

export default async function TrackingPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser()
  const { id } = await params

  const product = await findProduct(id)
  if (!product) notFound()

  const keys = await listIngestKeys(id)

  return (
    <div className="space-y-8">
      <div className="border-line border-b pb-4">
        <h1 className="text-xl font-semibold">{product.name}</h1>
      </div>

      <TrackingPageClient productId={id} initialKeys={keys} />
    </div>
  )
}
