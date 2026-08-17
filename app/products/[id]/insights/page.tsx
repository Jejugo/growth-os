import { notFound } from 'next/navigation'
import { requireUser } from '@/server/guard'
import { findProduct } from '@/modules/products/repo'
import { listLearnings, getAllRollupsForProduct } from '@/modules/analytics'
import { ProductNav } from '../_components/product-nav'
import { DismissLearningButton } from './_components/dismiss-button'

export const dynamic = 'force-dynamic'

const DIRECTION_LABEL: Record<string, string> = {
  increase: 'aumentar',
  decrease: 'reduzir',
  keep: 'manter',
  test: 'testar',
}

const DIRECTION_CLASS: Record<string, string> = {
  increase: 'text-ok',
  decrease: 'text-danger',
  keep: 'text-ink-soft',
  test: 'text-accent',
}

const DIMENSION_LABEL: Record<string, string> = {
  channel: 'Canal',
  angle: 'Ângulo',
  theme: 'Tema',
  segment: 'Segmento',
  hook_pattern: 'Padrão de hook',
  posting_hour: 'Hora de publicação',
  format: 'Formato',
  campaign: 'Campanha',
}

export default async function InsightsPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser()
  const { id } = await params

  const product = await findProduct(id)
  if (!product) notFound()

  const [activeLearnings, supersededLearnings, rollups] = await Promise.all([
    listLearnings(id, 'active'),
    listLearnings(id, 'superseded'),
    getAllRollupsForProduct(id, '28d'),
  ])

  const hypotheses = activeLearnings.filter((l) => l.kind === 'hypothesis')
  const learnings = activeLearnings.filter((l) => l.kind === 'learning')

  // Agrupa rollups por dimensão para a tabela de performance
  const rollupByDim = new Map<string, typeof rollups>()
  for (const r of rollups) {
    const key = r.dimension
    rollupByDim.set(key, [...(rollupByDim.get(key) ?? []), r])
  }

  return (
    <div className="space-y-8">
      <div className="border-line border-b pb-4">
        <h1 className="text-xl font-semibold">{product.name}</h1>
      </div>

      <ProductNav productId={id} active="insights" />

      {/* Aprendizados ativos */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">Aprendizados ativos</h2>
          <span className="text-ink-faint font-mono text-xs">{learnings.length} aprendizado{learnings.length !== 1 ? 's' : ''}</span>
        </div>

        {learnings.length === 0 ? (
          <div className="panel text-ink-soft p-8 text-center text-sm">
            Nenhum aprendizado confirmado ainda. Execute o job de geração de aprendizados após ter dados suficientes.
          </div>
        ) : (
          <div className="space-y-3">
            {learnings.map((l) => (
              <div key={l.id} className="panel rounded-xl p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-1.5">
                    <p className="text-sm leading-snug">{l.statement}</p>
                    <div className="flex flex-wrap gap-2">
                      <span className="bg-surface-dim rounded px-1.5 py-0.5 font-mono text-xs text-ink-soft">
                        {DIMENSION_LABEL[l.dimension] ?? l.dimension}: {l.dimensionValue}
                      </span>
                      <span className={`font-mono text-xs ${DIRECTION_CLASS[l.direction] ?? 'text-ink-soft'}`}>
                        ↗ {DIRECTION_LABEL[l.direction] ?? l.direction}
                      </span>
                      <span className="font-mono text-xs text-ink-faint">
                        confiança {Math.round(Number(l.confidence) * 100)}%
                      </span>
                    </div>
                  </div>
                  <DismissLearningButton id={l.id} productId={id} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Hipóteses */}
      {hypotheses.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold">Hipóteses</h2>
            <span className="text-ink-faint font-mono text-xs">amostra insuficiente</span>
          </div>

          <div className="space-y-2">
            {hypotheses.map((h) => (
              <div key={h.id} className="panel rounded-xl border-dashed p-4 opacity-80">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-1">
                    <p className="text-sm leading-snug text-ink-soft">{h.statement}</p>
                    <div className="flex gap-2">
                      <span className="bg-surface-dim rounded px-1.5 py-0.5 font-mono text-xs text-ink-faint">
                        {DIMENSION_LABEL[h.dimension] ?? h.dimension}: {h.dimensionValue}
                      </span>
                    </div>
                  </div>
                  <DismissLearningButton id={h.id} productId={id} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Rollups de performance — tabela por dimensão */}
      {rollups.length > 0 && (
        <section>
          <h2 className="mb-3 text-base font-semibold">Performance por ângulo (28 dias)</h2>
          <PerformanceTable rollups={rollupByDim.get('angle') ?? []} />
        </section>
      )}

      {/* Histórico de aprendizados superados */}
      {supersededLearnings.length > 0 && (
        <section>
          <h2 className="mb-3 text-base font-semibold text-ink-soft">Histórico</h2>
          <div className="space-y-2 opacity-50">
            {supersededLearnings.slice(0, 5).map((l) => (
              <div key={l.id} className="panel rounded-xl p-3">
                <p className="text-xs text-ink-soft line-through">{l.statement}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function PerformanceTable({
  rollups,
}: {
  rollups: Awaited<ReturnType<typeof getAllRollupsForProduct>>
}) {
  if (rollups.length === 0) return null

  const sorted = [...rollups].sort(
    (a, b) => Number(b.signupRate) - Number(a.signupRate),
  )

  return (
    <div className="panel overflow-x-auto rounded-xl">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-line border-b text-left">
            <th className="text-ink-soft px-4 py-3 font-medium">Ângulo</th>
            <th className="text-ink-soft px-4 py-3 text-right font-medium">Posts</th>
            <th className="text-ink-soft px-4 py-3 text-right font-medium">Cliques</th>
            <th className="text-ink-soft px-4 py-3 text-right font-medium">Signups</th>
            <th className="text-ink-soft px-4 py-3 text-right font-medium">Signup/clique</th>
            <th className="text-ink-soft px-4 py-3 text-right font-medium">Amostra</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.id} className="border-line border-b last:border-0">
              <td className="px-4 py-3 font-medium">{r.dimensionValue}</td>
              <td className="text-ink-soft px-4 py-3 text-right font-mono">{r.posts}</td>
              <td className="text-ink-soft px-4 py-3 text-right font-mono">{r.clicks}</td>
              <td className="text-ink-soft px-4 py-3 text-right font-mono">{r.signups}</td>
              <td className="px-4 py-3 text-right font-mono">
                {(Number(r.signupRate) * 100).toFixed(2)}%
              </td>
              <td className="px-4 py-3 text-right">
                {r.sampleSufficient ? (
                  <span className="text-ok text-xs">✓</span>
                ) : (
                  <span className="text-ink-faint text-xs">insuficiente</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
