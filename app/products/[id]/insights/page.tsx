import { notFound } from 'next/navigation'
import { requireUser } from '@/server/guard'
import { findProduct } from '@/modules/products/repo'
import { listLearnings, getAllRollupsForProduct } from '@/modules/analytics'
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

const DIRECTION_ARROW: Record<string, string> = {
  increase: '↗',
  decrease: '↘',
  keep: '→',
  test: '↗',
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

      {/* Aprendizados ativos */}
      <section>
        <div className="mb-2.5 flex items-center justify-between">
          <h2 className="text-accent text-sm font-medium">Aprendizados ativos</h2>
          <span className="text-ink-faint font-mono text-xs">
            {learnings.length} aprendizado{learnings.length !== 1 ? 's' : ''}
          </span>
        </div>

        {learnings.length === 0 ? (
          <div className="border-line text-ink-soft rounded-md border border-dashed p-8 text-center text-sm">
            Nenhum aprendizado confirmado ainda. Execute o job de geração de aprendizados após ter
            dados suficientes.
          </div>
        ) : (
          <div className="grid gap-2">
            {learnings.map((l) => (
              <div
                key={l.id}
                className="border-line flex items-center gap-4 rounded-md border px-4 py-3.5"
              >
                <span className={`w-6 shrink-0 font-mono text-base ${DIRECTION_CLASS[l.direction] ?? 'text-ink-faint'}`}>
                  {DIRECTION_ARROW[l.direction] ?? '→'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-snug">{l.statement}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <span className="tag tag-neutral font-mono">
                      {DIMENSION_LABEL[l.dimension] ?? l.dimension}: {l.dimensionValue}
                    </span>
                    <span className={`font-mono text-xs ${DIRECTION_CLASS[l.direction] ?? 'text-ink-soft'}`}>
                      {DIRECTION_LABEL[l.direction] ?? l.direction}
                    </span>
                    <span className="text-ink-faint font-mono text-xs">
                      confiança {Math.round(Number(l.confidence) * 100)}%
                    </span>
                  </div>
                </div>
                <DismissLearningButton id={l.id} productId={id} />
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* Rollups de performance — tabela por dimensão */}
        {rollups.length > 0 && (
          <section>
            <h2 className="text-accent mb-2.5 text-sm font-medium">
              Performance por ângulo · 28 dias
            </h2>
            <PerformanceTable rollups={rollupByDim.get('angle') ?? []} />
          </section>
        )}

        <div className="flex flex-col gap-4">
          {/* Hipóteses */}
          {hypotheses.length > 0 && (
            <section>
              <h2 className="text-ink-faint mb-2.5 text-sm font-medium">
                Hipóteses · amostra insuficiente
              </h2>
              <div className="grid gap-2">
                {hypotheses.map((h) => (
                  <div key={h.id} className="border-line rounded-md border border-dashed p-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-ink-soft flex-1 text-[12.5px] leading-relaxed">
                        {h.statement}
                      </p>
                      <DismissLearningButton id={h.id} productId={id} />
                    </div>
                    <span className="tag tag-neutral mt-2 font-mono">
                      {DIMENSION_LABEL[h.dimension] ?? h.dimension}: {h.dimensionValue}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Histórico de aprendizados superados */}
          {supersededLearnings.length > 0 && (
            <section>
              <h2 className="text-ink-faint mb-2.5 text-sm font-medium">Histórico</h2>
              <div className="grid gap-1.5 opacity-60">
                {supersededLearnings.slice(0, 5).map((l) => (
                  <p key={l.id} className="text-ink-faint text-xs line-through">
                    {l.statement}
                  </p>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
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
    <table className="table">
      <thead>
        <tr>
          <th>Ângulo</th>
          <th className="text-right">Posts</th>
          <th className="text-right">Cliques</th>
          <th className="text-right">Signups</th>
          <th className="text-right">Signup/clique</th>
          <th className="text-right">Amostra</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((r) => (
          <tr key={r.id}>
            <td>{r.dimensionValue}</td>
            <td className="text-right font-mono">{r.posts}</td>
            <td className="text-right font-mono">{r.clicks}</td>
            <td className="text-right font-mono">{r.signups}</td>
            <td className="text-right font-mono">{(Number(r.signupRate) * 100).toFixed(2)}%</td>
            <td className="text-right">
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
  )
}
