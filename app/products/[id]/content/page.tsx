import { notFound } from 'next/navigation'
import { requireUser } from '@/server/guard'
import { findProduct } from '@/modules/products'
import { listPosts, listIdeas } from '@/modules/content'
import { ANGLE_LABELS, type RiskReview } from '@/modules/content'
import { ProductNav } from '../_components/product-nav'
import { PostReviewPanel } from './post-review-panel'
import { PlanWeekButton } from './_components/plan-week-button'
import type { SocialPost, ContentIdea } from '@/modules/content'

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

  const [posts, ideas] = await Promise.all([listPosts(id), listIdeas(id)])

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

      <ProductNav productId={id} active="content" />

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Conteúdo da semana</h2>

        <PlanWeekButton productId={id} />
      </div>

      {selectedPost && (
        <PostReviewPanel post={selectedPost} productId={id} />
      )}

      {posts.length === 0 && ideas.length === 0 ? (
        <div className="panel text-ink-soft p-10 text-center text-sm">
          Nenhum conteúdo ainda. Clique em "Planejar semana" para gerar.
        </div>
      ) : (
        <div className="grid gap-4 overflow-x-auto lg:grid-cols-4">
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
                  <PostCard key={post.id} post={post} productId={id} />
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
    <div className="min-w-[240px]">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">{label}</h3>
          <p className="text-ink-faint text-xs">{description}</p>
        </div>
        <span className="text-ink-faint rounded bg-surface-dim px-1.5 py-0.5 font-mono text-xs">
          {count}
        </span>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function IdeaCard({ idea, productId }: { idea: ContentIdea; productId: string }) {
  return (
    <div className="panel rounded-lg p-3">
      <p className="text-ink-faint mb-1 font-mono text-xs">{ANGLE_LABELS[idea.angle]}</p>
      <p className="text-sm font-medium leading-snug">{idea.title}</p>
      <p className="text-ink-soft mt-1 line-clamp-2 text-xs">{idea.summary}</p>
      {idea.summary.startsWith('[near_duplicate') && (
        <p className="text-warn mt-2 font-mono text-xs">⚠ quase-duplicata</p>
      )}
    </div>
  )
}

function PostCard({ post, productId }: { post: SocialPost; productId: string }) {
  const review = post.riskReview as RiskReview | null

  return (
    <a
      href={`/products/${productId}/content?postId=${post.id}`}
      className="panel block rounded-lg p-3 transition-colors hover:border-accent/40"
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-ink-faint font-mono text-xs">{post.channel}</span>
        <RiskBadge verdict={review?.verdict} />
      </div>
      <p className="text-sm font-medium leading-snug">{post.hook}</p>
      {post.rejectionReason && (
        <p className="text-danger mt-1 line-clamp-1 text-xs">{post.rejectionReason}</p>
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
    <span className={`font-mono text-xs ${styles[verdict] ?? 'text-ink-faint'}`}>
      {labels[verdict] ?? verdict}
    </span>
  )
}
