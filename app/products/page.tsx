import Link from 'next/link'
import { requireUser } from '@/server/guard'
import { listProducts } from '@/modules/products'
import { StatusBadge } from '../_components/status-badge'

export const dynamic = 'force-dynamic'

export default async function ProductsPage() {
  await requireUser()
  const products = await listProducts()

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Produtos</h1>
        <Link
          href="/products/new"
          className="bg-ink text-surface hover:bg-ink-soft rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
        >
          Adicionar SaaS
        </Link>
      </div>

      {products.length === 0 ? (
        <div className="panel text-ink-soft p-10 text-center text-sm">
          Nenhum produto cadastrado. Comece colando a URL de um SaaS.
        </div>
      ) : (
        <ul className="panel divide-line divide-y">
          {products.map((product) => (
            <li key={product.id}>
              <Link
                href={`/products/${product.id}`}
                className="hover:bg-accent-soft/40 block px-4 py-3.5 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="font-medium">{product.name}</span>
                  <StatusBadge status={product.analysisStatus} />
                </div>
                <div className="text-ink-faint mt-1 flex items-center gap-3 font-mono text-xs">
                  <span>{product.domain}</span>
                  {product.lastAnalyzedAt && (
                    <span>analisado em {product.lastAnalyzedAt.toLocaleDateString('pt-BR')}</span>
                  )}
                </div>
                {product.analysisStatus === 'failed' && product.analysisError && (
                  <p className="text-danger mt-1.5 text-xs">{product.analysisError}</p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
