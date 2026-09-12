import { notFound } from 'next/navigation'
import { requireUser } from '@/server/guard'
import { findProduct, getCurrentProfile } from '@/modules/products'
import {
  findLatestLandingPage,
  findLatestReadyLandingPage,
  findLandingPageDraft,
  findLatestBrief,
} from '@/modules/validation'
import type { CustomLandingFile } from '@/modules/validation'
import { AnalysisPoller } from '../_components/analysis-poller'
import { LandingCreationPanel } from './_components/landing-creation-panel'
import { LandingPreviewPanel } from './_components/landing-preview-panel'
import { buildExternalDesignPrompt } from './_lib/build-design-prompt'
import { buildTrackingSnippet } from './_lib/build-tracking-snippet'
import { shortDeployUrl } from './_lib/deploy-url'
import { env } from '@/lib/env'

export const dynamic = 'force-dynamic'

/** Compara por conteúdo (nome + dado), não por referência — ordem dos arquivos não importa. */
function filesMatch(a: CustomLandingFile[] | null | undefined, b: CustomLandingFile[] | null | undefined): boolean {
  if (!a || !b || a.length !== b.length) return false
  const byName = new Map(a.map((f) => [f.file, f.data]))
  return b.every((f) => byName.get(f.file) === f.data)
}

export default async function LandingPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser()
  const { id } = await params

  const product = await findProduct(id)
  if (!product) notFound()

  const [landingPage, lastReadyLandingPage, draft, brief, profile] = await Promise.all([
    findLatestLandingPage(id),
    findLatestReadyLandingPage(id),
    findLandingPageDraft(id),
    findLatestBrief(id),
    getCurrentProfile(id),
  ])

  const designPrompt = buildExternalDesignPrompt({
    productName: product.name,
    brief: brief ?? null,
    profile: profile ?? null,
    copy: landingPage?.copy ?? null,
  })

  const trackingSnippet = buildTrackingSnippet({
    productId: id,
    baseUrl: env().NEXT_PUBLIC_BASE_URL,
  })

  // O rascunho continua existindo depois de publicar (você pode seguir ajustando e republicando) —
  // então "tem rascunho" não é o mesmo que "tem mudança não publicada". Sem essa checagem, o preview
  // mostraria "ainda não publicado" pra sempre, mesmo logo depois de um publish bem-sucedido.
  const draftAlreadyPublished =
    !!draft &&
    landingPage?.status === 'ready' &&
    landingPage.source === 'custom_upload' &&
    filesMatch(landingPage.files, draft.files)
  const pendingDraft = draftAlreadyPublished ? null : (draft ?? null)

  return (
    <div className="space-y-8">
      <div className="border-line border-b pb-4">
        <h1 className="text-xl font-semibold">{product.name}</h1>
      </div>

      <AnalysisPoller isRunning={landingPage?.status === 'generating'} />

      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[420px_minmax(0,1fr)]">
        <div>
          <h2 className="mb-1 text-base font-semibold">Landing de waitlist</h2>
          <p className="text-ink-soft mb-3 text-sm">
            Gere automaticamente por IA, ou desenhe fora (Claude Design, Google Stitch, v0...) e
            suba o resultado como um zip.
          </p>
          <LandingCreationPanel
            productId={id}
            landingPage={landingPage ?? null}
            draft={draft ?? null}
            draftAlreadyPublished={draftAlreadyPublished}
            designPrompt={designPrompt}
            trackingSnippet={trackingSnippet}
          />
        </div>

        <div>
          <h2 className="mb-1 text-base font-semibold">Preview</h2>
          <p className="text-ink-soft mb-3 text-sm">Status, URL e o que está publicado agora.</p>
          <LandingPreviewPanel
            productId={id}
            landingPage={landingPage ?? null}
            draft={pendingDraft}
            lastLiveDeployUrl={
              landingPage?.id === lastReadyLandingPage?.id
                ? null
                : lastReadyLandingPage
                  ? shortDeployUrl(lastReadyLandingPage)
                  : null
            }
          />
        </div>
      </div>
    </div>
  )
}
