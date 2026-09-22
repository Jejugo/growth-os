import { notFound } from 'next/navigation'
import { requireUser } from '@/server/guard'
import { findProduct } from '@/modules/products'
import { listPublications, listChannelAccounts, type Publication } from '@/modules/distribution'
import { findPost, type SocialPost } from '@/modules/content'
import { getPostMetrics } from '@/modules/attribution/repo'
import { PublicationRow } from './_components/publication-row'
import { ManualQueue } from './_components/manual-queue'
import { listManualQueue } from '@/modules/distribution/manual'

const STATUS_CLASS: Record<Publication['status'], string> = {
  scheduled: 'text-accent',
  publishing: 'text-warn',
  published: 'text-ok',
  failed: 'text-danger',
  unknown: 'text-warn',
  cancelled: 'text-ink-faint',
  awaiting_manual: 'text-accent',
}

const STATUS_LABEL: Record<Publication['status'], string> = {
  scheduled: 'agendado',
  publishing: 'publicando…',
  published: 'publicado',
  failed: 'falhou',
  unknown: 'desconhecido',
  cancelled: 'cancelado',
  awaiting_manual: 'esperando você',
}

export default async function PublicationsPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser()
  const { id } = await params
  const product = await findProduct(id)
  if (!product) notFound()

  const [publications, accounts, manualQueue] = await Promise.all([
    listPublications(id, { limit: 100 }),
    listChannelAccounts(id),
    listManualQueue(id),
  ])

  const accountMap = Object.fromEntries(accounts.map((a) => [a.id, a]))

  const postMap = new Map<string, SocialPost>()
  const metricsMap = new Map<string, { clicks: number; signups: number }>()
  await Promise.all(
    publications.map(async (pub) => {
      const [post, metrics] = await Promise.all([findPost(pub.postId), getPostMetrics(pub.postId)])
      if (post) postMap.set(pub.postId, post)
      metricsMap.set(pub.postId, metrics)
    }),
  )

  const unknowns = publications.filter((p) => p.status === 'unknown')
  const others = publications.filter((p) => p.status !== 'unknown')

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">{product.name} — Publicações</h1>
        <p className="text-ink-soft mt-1 text-sm">Histórico de publicações e tentativas.</p>
      </div>

      <ManualQueue
        productId={id}
        items={manualQueue}
        hasManualChannel={accounts.some((account) => account.channel === 'linkedin')}
      />

      {unknowns.length > 0 && (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <span className="bg-warn h-1.5 w-1.5 rounded-full" />
            <h2 className="text-warn text-sm font-medium">
              Aguardando confirmação ({unknowns.length})
            </h2>
          </div>
          <div className="grid gap-2">
            {unknowns.map((pub) => (
              <PublicationRow
                key={pub.id}
                publication={pub}
                account={accountMap[pub.channelAccountId]}
                post={postMap.get(pub.postId)}
              />
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-accent mb-2.5 text-sm font-medium">
          Histórico — {others.length} publicações
        </h2>
        {others.length === 0 ? (
          <p className="text-ink-faint text-sm">Nenhuma publicação ainda.</p>
        ) : (
          <table className="table font-mono">
            <thead>
              <tr>
                <th>Canal</th>
                <th className="font-sans">Post</th>
                <th>Status</th>
                <th>Publicado</th>
                <th className="text-right">Cliques</th>
                <th className="text-right">Signups</th>
              </tr>
            </thead>
            <tbody>
              {others.map((pub) => {
                const post = postMap.get(pub.postId)
                const metrics = metricsMap.get(pub.postId)
                const account = accountMap[pub.channelAccountId]
                return (
                  <tr key={pub.id}>
                    <td>{account?.channel ?? '—'}</td>
                    <td className="font-sans max-w-[340px] truncate">{post?.hook ?? '—'}</td>
                    <td className={STATUS_CLASS[pub.status]}>{STATUS_LABEL[pub.status]}</td>
                    <td>
                      {pub.publishedAt
                        ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(
                            pub.publishedAt,
                          )
                        : '—'}
                    </td>
                    <td className="text-ink-faint text-right">
                      {pub.status === 'published' ? (metrics?.clicks ?? 0) : '—'}
                    </td>
                    <td className="text-ink-faint text-right">
                      {pub.status === 'published' ? (metrics?.signups ?? 0) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
