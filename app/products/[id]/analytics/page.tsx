import { notFound } from 'next/navigation'
import { requireUser } from '@/server/guard'
import { findProduct } from '@/modules/products/repo'
import { getAnalyticsSummary, getPostsAnalytics } from '@/modules/attribution/repo'

export const dynamic = 'force-dynamic'

export default async function AnalyticsPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser()
  const { id } = await params

  const product = await findProduct(id)
  if (!product) notFound()

  const [funnel, postsAnalytics] = await Promise.all([
    getAnalyticsSummary(id),
    getPostsAnalytics(id),
  ])

  return (
    <div className="space-y-8">
      <div className="border-line border-b pb-4">
        <h1 className="text-xl font-semibold">{product.name}</h1>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        {/* Funil por canal */}
        <section>
          <h2 className="text-accent mb-2.5 text-sm font-medium">Funil por canal</h2>
          {funnel.length === 0 ? (
            <div className="border-line text-ink-soft rounded-md border border-dashed p-8 text-center text-sm">
              Nenhum dado de atribuição ainda. Configure uma chave de ingestão e comece a enviar
              eventos.
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Canal</th>
                  <th className="text-right">Cliques</th>
                  <th className="text-right">Signups</th>
                  <th className="text-right">Conversão</th>
                </tr>
              </thead>
              <tbody>
                {funnel.map((row) => (
                  <tr key={row.channel}>
                    <td>{row.channel}</td>
                    <td className="text-right font-mono">{row.clicks.toLocaleString('pt-BR')}</td>
                    <td className="text-right font-mono">{row.signups.toLocaleString('pt-BR')}</td>
                    <td
                      className={`text-right font-mono ${row.conversionRate >= 5 ? 'text-ok' : row.clicks > 0 ? 'text-warn' : ''}`}
                    >
                      {row.conversionRate.toFixed(2)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* Posts publicados */}
        <section>
          <h2 className="text-accent mb-2.5 text-sm font-medium">Posts publicados</h2>
          {postsAnalytics.length === 0 ? (
            <div className="border-line text-ink-soft rounded-md border border-dashed p-8 text-center text-sm">
              Nenhum post com dados de atribuição ainda.
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th className="font-sans">Post</th>
                  <th>Canal</th>
                  <th className="text-right">Cliques</th>
                  <th className="text-right">Signups</th>
                  <th className="text-right">Conv.</th>
                </tr>
              </thead>
              <tbody>
                {postsAnalytics.map((row) => {
                  const convRate =
                    row.clicks > 0 ? Math.round((row.signups / row.clicks) * 10000) / 100 : 0
                  return (
                    <tr key={row.postId}>
                      <td className="font-sans max-w-[250px] truncate">{row.hook ?? '—'}</td>
                      <td className="text-xs">{row.channel}</td>
                      <td className="text-right font-mono">{row.clicks}</td>
                      <td className="text-right font-mono">{row.signups}</td>
                      <td className={`text-right font-mono ${convRate >= 5 ? 'text-ok' : convRate > 0 ? 'text-warn' : ''}`}>
                        {convRate.toFixed(2)}%
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <p className="text-ink-faint text-xs">
        Atribuição por link de tracking <span className="font-mono">/r/[code]</span> e eventos
        recebidos em <span className="font-mono">/api/events</span>.
      </p>
    </div>
  )
}
