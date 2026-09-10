import { notFound } from 'next/navigation'
import { requireUser } from '@/server/guard'
import { findProduct } from '@/modules/products'
import { listSegments } from '@/modules/audiences'
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
          <button type="submit" className="btn btn-secondary">
            {segments.length > 0 ? 'Rederivar segmentos' : 'Derivar segmentos'}
          </button>
        </form>
      </div>

      {segments.length === 0 ? (
        <div className="border-line text-ink-soft rounded-md border border-dashed p-10 text-center text-sm">
          Nenhum segmento ainda. Clique em "Derivar segmentos" para gerar a partir do perfil do
          produto.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {segments.map((seg) => (
            <div
              key={seg.id}
              className={`card elev-sm ${seg.status !== 'active' ? 'opacity-60' : ''}`}
              style={
                seg.scoreSource === 'measured'
                  ? { boxShadow: '0 0 0 1px color-mix(in srgb, var(--color-accent) 40%, transparent)' }
                  : undefined
              }
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="flex-1 leading-tight font-medium">{seg.name}</h3>
                <span className={`tag font-mono ${seg.scoreSource === 'measured' ? 'tag-accent' : 'tag-neutral'}`}>
                  {seg.status !== 'active'
                    ? seg.status === 'paused'
                      ? 'pausado'
                      : 'arquivado'
                    : seg.scoreSource === 'measured'
                      ? 'medido'
                      : 'estimativa IA'}
                </span>
              </div>

              <p className="card-body">{seg.description}</p>

              {seg.painPoints.length > 0 && (
                <div>
                  <p className="card-kicker mb-1.5">Dores principais</p>
                  <ul className="text-ink-soft grid gap-1 text-xs">
                    {seg.painPoints.map((p, i) => (
                      <li key={i} className="flex gap-1">
                        <span className="text-ink-faint">•</span>
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="border-line grid grid-cols-3 gap-2 border-t pt-2.5 text-center">
                <ScoreCell label="Fit" value={seg.audienceFitScore} />
                <ScoreCell label="Intensidade" value={seg.problemIntensityScore} />
                <ScoreCell label="Conversão" value={seg.conversionPotentialScore} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ScoreCell({ label, value }: { label: string; value: number }) {
  const color = value >= 70 ? 'text-ok' : value >= 40 ? 'text-warn' : 'text-ink-faint'
  return (
    <div>
      <p className={`font-mono text-[18px] tabular-nums ${color}`}>{value}</p>
      <p className="text-ink-faint mt-1 text-[10.5px]">{label}</p>
    </div>
  )
}
