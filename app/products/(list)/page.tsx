import Link from 'next/link'
import { requireUser } from '@/server/guard'
import { listProducts } from '@/modules/products'
import { getAnalyticsSummary } from '@/modules/attribution/repo'
import { StatusBadge } from '../../_components/status-badge'
import { ProductAvatar } from '../_components/product-avatar'
import type { ProductStage } from '@/modules/products'

export const dynamic = 'force-dynamic'

const STAGE_LABEL: Record<ProductStage, string> = {
  idea: 'ideia',
  validating: 'validando',
  building: 'construindo',
  launched: 'lançado',
}

export default async function ProductsPage() {
  await requireUser()
  const products = await listProducts()

  const launched = products.filter((p) => p.stage === 'launched')
  const metricsByProduct = new Map<string, { clicks: number; signups: number; conversionRate: number }>()
  await Promise.all(
    launched.map(async (p) => {
      const byChannel = await getAnalyticsSummary(p.id)
      const clicks = byChannel.reduce((sum, c) => sum + c.clicks, 0)
      const signups = byChannel.reduce((sum, c) => sum + c.signups, 0)
      metricsByProduct.set(p.id, {
        clicks,
        signups,
        conversionRate: clicks > 0 ? Math.round((signups / clicks) * 10000) / 100 : 0,
      })
    }),
  )

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Produtos</h1>
        <Link href="/products/new" className="btn btn-primary">
          Adicionar SaaS
        </Link>
      </div>

      {products.length === 0 ? (
        <div className="border-line text-ink-soft rounded-md border border-dashed p-10 text-center text-sm">
          Nenhum produto cadastrado. Comece colando a URL de um SaaS.
        </div>
      ) : (
        <div className="grid gap-2.5">
          {products.map((product) => {
            const metrics = metricsByProduct.get(product.id)
            return (
              <Link
                key={product.id}
                href={`/products/${product.id}`}
                className="border-line hover:border-accent/40 flex items-center gap-4 rounded-md border px-4 py-3.5 transition-colors"
              >
                <ProductAvatar name={product.name} logoUrl={product.logoUrl} size={40} />

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[15px] font-medium">{product.name}</span>
                    <StatusBadge status={product.analysisStatus} />
                    <span className="tag tag-outline font-mono">{STAGE_LABEL[product.stage]}</span>
                  </div>
                  <div className="text-ink-faint mt-1 flex gap-3 font-mono text-[11.5px]">
                    <span>{product.domain ?? 'sem site'}</span>
                    {product.lastAnalyzedAt && (
                      <span>analisado em {product.lastAnalyzedAt.toLocaleDateString('pt-BR')}</span>
                    )}
                  </div>
                  {product.analysisStatus === 'failed' && product.analysisError && (
                    <p className="text-danger mt-1.5 text-xs">{product.analysisError}</p>
                  )}
                </div>
                {metrics && (
                  <div className="flex shrink-0 gap-6 text-right">
                    <Stat value={metrics.clicks} label="cliques" />
                    <Stat value={metrics.signups} label="signups" />
                    <Stat value={`${metrics.conversionRate}%`} label="conversão" accent="ok" />
                  </div>
                )}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Stat({
  value,
  label,
  accent,
}: {
  value: string | number
  label: string
  accent?: 'ok'
}) {
  return (
    <div>
      <div
        className={`font-mono text-[17px] tracking-tight ${accent === 'ok' ? 'text-ok' : ''}`}
      >
        {value}
      </div>
      <div className="text-ink-faint mt-0.5 text-[11px]">{label}</div>
    </div>
  )
}
