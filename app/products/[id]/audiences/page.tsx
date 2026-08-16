import { notFound } from 'next/navigation'
import { requireUser } from '@/server/guard'
import { findProduct } from '@/modules/products'
import { listSegments } from '@/modules/audiences'
import { ProductNav } from '../_components/product-nav'
import { deriveSegmentsAction } from '../../../actions/content'

export const dynamic = 'force-dynamic'

export default async function AudiencesPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser()
  const { id } = await params

  const product = await findProduct(id)
  if (!product) notFound()

  const segments = await listSegments(id)

  return (
    <div className="space-y-6">
      <div className="border-line border-b pb-4">
        <h1 className="text-xl font-semibold">{product.name}</h1>
      </div>

      <ProductNav productId={id} active="audiences" />

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium">Segmentos de audiência</h2>
          <p className="text-ink-soft mt-1 text-sm">
            Scores são estimativas da IA (
            <code className="font-mono text-xs">ai_estimate</code>). A fase 4 os substitui por
            dados medidos.
          </p>
        </div>

        <form action={deriveSegmentsAction}>
          <input type="hidden" name="productId" value={id} />
          <button
            type="submit"
            className="border-line hover:bg-accent-soft rounded-lg border px-4 py-2 text-sm transition-colors"
          >
            {segments.length > 0 ? 'Rederiver segmentos' : 'Derivar segmentos'}
          </button>
        </form>
      </div>

      {segments.length === 0 ? (
        <div className="panel text-ink-soft p-10 text-center text-sm">
          Nenhum segmento ainda. Clique em "Derivar segmentos" para gerar a partir do perfil do
          produto.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {segments.map((seg) => (
            <div key={seg.id} className="panel space-y-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-medium leading-tight">{seg.name}</h3>
                <span
                  className={[
                    'shrink-0 rounded px-1.5 py-0.5 font-mono text-xs',
                    seg.status === 'active'
                      ? 'bg-ok/10 text-ok'
                      : 'text-ink-faint bg-surface-dim',
                  ].join(' ')}
                >
                  {seg.status}
                </span>
              </div>

              <p className="text-ink-soft text-sm leading-relaxed">{seg.description}</p>

              {seg.painPoints.length > 0 && (
                <div>
                  <p className="label-xs mb-1">Dores principais</p>
                  <ul className="text-ink-soft space-y-0.5 text-xs">
                    {seg.painPoints.map((p, i) => (
                      <li key={i} className="flex gap-1">
                        <span className="text-ink-faint">•</span>
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="border-line grid grid-cols-3 divide-x divide-line border-t pt-3 text-center">
                <ScoreCell label="Fit" value={seg.audienceFitScore} />
                <ScoreCell label="Intensidade" value={seg.problemIntensityScore} />
                <ScoreCell label="Conversão" value={seg.conversionPotentialScore} />
              </div>

              <p className="text-ink-faint font-mono text-xs">
                {seg.scoreSource === 'ai_estimate' ? 'estimativa IA' : 'medido'}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ScoreCell({ label, value }: { label: string; value: number }) {
  const color =
    value >= 70 ? 'text-ok' : value >= 40 ? 'text-warn' : 'text-ink-faint'
  return (
    <div className="px-2">
      <p className={`text-lg font-semibold tabular-nums ${color}`}>{value}</p>
      <p className="text-ink-faint text-xs">{label}</p>
    </div>
  )
}
