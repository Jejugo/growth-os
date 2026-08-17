import { notFound } from 'next/navigation'
import { requireUser } from '@/server/guard'
import { findProduct } from '@/modules/products/repo'
import { getAnalyticsSummary, getPostsAnalytics } from '@/modules/attribution/repo'
import { ProductNav } from '../_components/product-nav'

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

      <ProductNav productId={id} active="analytics" />

      {/* Funil por canal */}
      <section>
        <h2 className="mb-3 text-base font-semibold">Funil por canal</h2>
        {funnel.length === 0 ? (
          <div className="panel text-ink-soft p-8 text-center text-sm">
            Nenhum dado de atribuição ainda. Configure uma chave de ingestão e comece a enviar eventos.
          </div>
        ) : (
          <div className="panel overflow-x-auto rounded-lg">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-line border-b text-left">
                  <th className="text-ink-soft px-4 py-3 font-medium">Canal</th>
                  <th className="text-ink-soft px-4 py-3 text-right font-medium">Cliques</th>
                  <th className="text-ink-soft px-4 py-3 text-right font-medium">Signups</th>
                  <th className="text-ink-soft px-4 py-3 text-right font-medium">Taxa de conversão</th>
                </tr>
              </thead>
              <tbody>
                {funnel.map((row) => (
                  <tr key={row.channel} className="border-line border-b last:border-0">
                    <td className="px-4 py-3 font-medium">{row.channel}</td>
                    <td className="text-ink-soft px-4 py-3 text-right font-mono">{row.clicks.toLocaleString('pt-BR')}</td>
                    <td className="text-ink-soft px-4 py-3 text-right font-mono">{row.signups.toLocaleString('pt-BR')}</td>
                    <td className="text-ink-soft px-4 py-3 text-right font-mono">
                      {row.conversionRate.toFixed(2)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Posts publicados */}
      <section>
        <h2 className="mb-3 text-base font-semibold">Posts publicados</h2>
        {postsAnalytics.length === 0 ? (
          <div className="panel text-ink-soft p-8 text-center text-sm">
            Nenhum post com dados de atribuição ainda.
          </div>
        ) : (
          <div className="panel overflow-x-auto rounded-lg">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-line border-b text-left">
                  <th className="text-ink-soft px-4 py-3 font-medium">Post ID</th>
                  <th className="text-ink-soft px-4 py-3 font-medium">Canal</th>
                  <th className="text-ink-soft px-4 py-3 text-right font-medium">Cliques</th>
                  <th className="text-ink-soft px-4 py-3 text-right font-medium">Signups</th>
                  <th className="text-ink-soft px-4 py-3 text-right font-medium">Conversão</th>
                </tr>
              </thead>
              <tbody>
                {postsAnalytics.map((row) => {
                  const convRate = row.clicks > 0
                    ? Math.round((row.signups / row.clicks) * 10000) / 100
                    : 0
                  return (
                    <tr key={row.postId} className="border-line border-b last:border-0">
                      <td className="px-4 py-3 font-mono text-xs">{row.postId.slice(-8)}</td>
                      <td className="text-ink-soft px-4 py-3">{row.channel}</td>
                      <td className="text-ink-soft px-4 py-3 text-right font-mono">{row.clicks}</td>
                      <td className="text-ink-soft px-4 py-3 text-right font-mono">{row.signups}</td>
                      <td className="text-ink-soft px-4 py-3 text-right font-mono">{convRate.toFixed(2)}%</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
