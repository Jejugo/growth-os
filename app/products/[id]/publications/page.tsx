import { notFound } from 'next/navigation'
import { requireUser } from '@/server/guard'
import { findProduct } from '@/modules/products/repo'
import { listPublications, listChannelAccounts } from '@/modules/distribution/repo'
import { findPost } from '@/modules/content/repo'
import { ProductNav } from '../_components/product-nav'
import { PublicationRow } from './_components/publication-row'
import type { Publication } from '@/modules/distribution/schema'

export default async function PublicationsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireUser()
  const { id } = await params
  const product = await findProduct(id)
  if (!product) notFound()

  const [publications, accounts] = await Promise.all([
    listPublications(id, { limit: 100 }),
    listChannelAccounts(id),
  ])

  const accountMap = Object.fromEntries(accounts.map((a) => [a.id, a]))

  const unknowns = publications.filter((p) => p.status === 'unknown')
  const others = publications.filter((p) => p.status !== 'unknown')

  return (
    <div className="space-y-8">
      <ProductNav productId={id} active="publications" />

      <div>
        <h1 className="text-xl font-semibold text-ink">{product.name} — Publicações</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Histórico de publicações, tentativas e trilha de auditoria.
        </p>
      </div>

      {unknowns.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-yellow-700 dark:text-yellow-400">
            ⚠️ Aguardando confirmação ({unknowns.length})
          </h2>
          <div className="space-y-2">
            {unknowns.map((pub) => (
              <PublicationRow
                key={pub.id}
                publication={pub}
                account={accountMap[pub.channelAccountId]}
              />
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-sm font-medium text-ink-soft">
          Histórico — {others.length} publicações
        </h2>
        {others.length === 0 ? (
          <p className="text-sm text-ink-faint">Nenhuma publicação ainda.</p>
        ) : (
          <div className="space-y-2">
            {others.map((pub) => (
              <PublicationRow
                key={pub.id}
                publication={pub}
                account={accountMap[pub.channelAccountId]}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
