import { notFound } from 'next/navigation'
import { requireUser } from '@/server/guard'
import { findProduct } from '@/modules/products'
import { listPosts, listIdeas } from '@/modules/content'
import { ANGLE_LABELS, type RiskReview } from '@/modules/content'
import { listActiveChannelAccounts } from '@/modules/distribution/repo'
import { getPostMetrics } from '@/modules/attribution/repo'
import { PostReviewPanel } from './post-review-panel'
import { PlanWeekButton } from './_components/plan-week-button'
import type { SocialPost, ContentIdea } from '@/modules/content'
import type { ChannelAccount } from '@/modules/distribution/schema'

export const dynamic = 'force-dynamic'

const KANBAN_COLUMNS: Array<{
  key: SocialPost['status'] | 'ideas'
  label: string
  description: string
}> = [
  { key: 'ideas', label: 'Ideias', description: 'Ideias propostas pelo planejador' },
  { key: 'pending_approval', label: 'Revisão', description: 'Posts aguardando sua aprovação' },
  { key: 'approved', label: 'Aprovado', description: 'Pronto para publicar na fase 2' },
  { key: 'rejected', label: 'Rejeitado', description: 'Descartados com motivo' },
]

export default async function ContentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ postId?: string }>
}) {
  await requireUser()
  const { id } = await params
  const { postId } = await searchParams

  const product = await findProduct(id)
  if (!product) notFound()

  const [posts, ideas, channelAccounts] = await Promise.all([
    listPosts(id),
    listIdeas(id),
    listActiveChannelAccounts(id),
  ])

  // Métricas de atribuição apenas para posts publicados
  const publishedPostIds = posts
    .filter((p) => p.status === 'published')
    .map((p) => p.id)
  const postMetricsMap = new Map<string, { clicks: number; signups: number }>()
  await Promise.all(
    publishedPostIds.map(async (pid) => {
      const m = await getPostMetrics(pid)
      postMetricsMap.set(pid, m)
    }),
  )

  const selectedPost = postId ? posts.find((p) => p.id === postId) : null

  // Agrupar por coluna
  const postsByStatus = Object.fromEntries(
    KANBAN_COLUMNS.filter((c) => c.key !== 'ideas').map((c) => [
      c.key,
      posts.filter((p) => p.status === c.key),
    ]),
  ) as Record<SocialPost['status'], SocialPost[]>

  const pendingIdeas = ideas.filter((i) => i.status === 'proposed')

  return (
    <div className="space-y-6">
      <div className="border-line border-b pb-4">
        <h1 className="text-xl font-semibold">{product.name}</h1>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Conteúdo da semana</h2>

        <PlanWeekButton productId={id} />
      </div>

      {selectedPost && (
        <PostReviewPanel
          post={selectedPost}
          productId={id}
          productUrl={product.url ?? ''}
          channelAccounts={channelAccounts.filter((a) => a.channel === selectedPost.channel)}
        />
      )}

      {posts.length === 0 && ideas.length === 0 ? (
        <div className="border-line text-ink-soft rounded-md border border-dashed p-10 text-center text-sm">
          Nenhum conteúdo ainda. Clique em "Planejar semana" para gerar.
        </div>
      ) : (
        <div className="divide-line flex gap-4 divide-x overflow-x-auto">
          {/* Coluna: Ideias */}
          <KanbanColumn
            label="Ideias"
            description="Ideias propostas pelo planejador"
            count={pendingIdeas.length}
          >
            {pendingIdeas.map((idea) => (
              <IdeaCard key={idea.id} idea={idea} productId={id} />
            ))}
          </KanbanColumn>

          {/* Colunas de posts */}
          {KANBAN_COLUMNS.filter((c) => c.key !== 'ideas').map((col) => {
            const colPosts = postsByStatus[col.key as SocialPost['status']] ?? []
            return (
              <KanbanColumn
                key={col.key}
                label={col.label}
                description={col.description}
                count={colPosts.length}
              >
                {colPosts.map((post) => (
                  <PostCard
                    key={post.id}
                    post={post}
                    productId={id}
                    metrics={postMetricsMap.get(post.id)}
                  />
                ))}
              </KanbanColumn>
            )
          })}
        </div>
      )}
    </div>
  )
}

// --- Componentes de coluna e card ----------------------------------------

function KanbanColumn({
  label,
  description,
  count,
  children,
}: {
  label: string
  description: string
  count: number
  children: React.ReactNode
}) {
  return (
    <div className="min-w-[240px] flex-1 pl-4 first:pl-0">
      <div className="mb-2.5 flex items-baseline justify-between">
        <div>
          <h3 className="text-sm font-medium">{label}</h3>
          <p className="text-ink-faint text-xs">{description}</p>
        </div>
        <span className="text-ink-faint bg-line/40 rounded-sm px-1.5 py-0.5 font-mono text-xs">
          {count}
        </span>
      </div>
      <div className="grid gap-2">{children}</div>
    </div>
  )
}

function IdeaCard({ idea, productId }: { idea: ContentIdea; productId: string }) {
  return (
    <div className="card">
      <p className="card-kicker">{ANGLE_LABELS[idea.angle]}</p>
      <p className="text-[12.5px] font-medium leading-snug">{idea.title}</p>
      <p className="card-body line-clamp-2">{idea.summary}</p>
      {idea.summary.startsWith('[near_duplicate') && (
        <p className="text-warn font-mono text-[10.5px]">⚠ quase-duplicata</p>
      )}
    </div>
  )
}

function PostCard({
  post,
  productId,
  metrics,
}: {
  post: SocialPost
  productId: string
  metrics?: { clicks: number; signups: number }
}) {
  const review = post.riskReview as RiskReview | null

  return (
    <a
      href={`/products/${productId}/content?postId=${post.id}`}
      className="card hover:border-accent/40 transition-colors"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-ink-faint font-mono text-[10.5px]">{post.channel}</span>
        <RiskBadge verdict={review?.verdict} />
      </div>
      <p className="text-[12.5px] font-medium leading-snug">{post.hook}</p>
      {post.rejectionReason && (
        <p className="text-danger line-clamp-1 text-[11px]">{post.rejectionReason}</p>
      )}
      {post.status === 'published' && metrics && (
        <p className="text-ink-faint font-mono text-[11px]">
          {metrics.clicks} cliques · {metrics.signups} signups
        </p>
      )}
    </a>
  )
}

function RiskBadge({ verdict }: { verdict?: string }) {
  if (!verdict) return null
  const styles: Record<string, string> = {
    pass: 'text-ok',
    flag: 'text-warn',
    block: 'text-danger',
  }
  const labels: Record<string, string> = { pass: 'ok', flag: 'flag', block: 'block' }
  return (
    <span className={`font-mono text-[10.5px] ${styles[verdict] ?? 'text-ink-faint'}`}>
      {labels[verdict] ?? verdict}
    </span>
  )
}
