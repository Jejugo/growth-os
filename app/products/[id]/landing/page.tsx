import { notFound } from 'next/navigation'
import { requireUser } from '@/server/guard'
import { findProduct, getCurrentProfile } from '@/modules/products'
import { findLatestLandingPage, findLatestBrief } from '@/modules/validation'
import { AnalysisPoller } from '../_components/analysis-poller'
import { LandingCreationPanel } from './_components/landing-creation-panel'
import { buildExternalDesignPrompt } from './_lib/build-design-prompt'

export const dynamic = 'force-dynamic'

export default async function LandingPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser()
  const { id } = await params

  const product = await findProduct(id)
  if (!product) notFound()

  const [landingPage, brief, profile] = await Promise.all([
    findLatestLandingPage(id),
    findLatestBrief(id),
    getCurrentProfile(id),
  ])

  const designPrompt = buildExternalDesignPrompt({
    productName: product.name,
    brief: brief ?? null,
    profile: profile ?? null,
    copy: landingPage?.copy ?? null,
  })

  return (
    <div className="space-y-8">
      <div className="border-line border-b pb-4">
        <h1 className="text-xl font-semibold">{product.name}</h1>
      </div>

      <AnalysisPoller isRunning={landingPage?.status === 'generating'} />

      <div className="max-w-2xl">
        <h2 className="mb-1 text-base font-semibold">Landing de waitlist</h2>
        <p className="text-ink-soft mb-3 text-sm">
          Gere automaticamente por IA, ou desenhe fora (Claude Design, Google Stitch, v0...) e
          suba o resultado como um zip.
        </p>
        <LandingCreationPanel productId={id} landingPage={landingPage ?? null} designPrompt={designPrompt} />
      </div>
    </div>
  )
}
