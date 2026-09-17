import { notFound } from 'next/navigation'
import { requireUser } from '@/server/guard'
import { findProduct } from '@/modules/products'
import { listPosts, listIdeas, type RiskReview } from '@/modules/content'
import { listCampaigns } from '@/modules/campaigns'
import { listActiveChannelAccounts } from '@/modules/distribution'
import { getPostMetrics } from '@/modules/attribution/repo'
import { OperationsHeader } from '../_components/operations-header'
import { PostReviewPanel } from './post-review-panel'
import { PlanWeekButton } from './_components/plan-week-button'
import { ContentBoard } from './_components/content-board'

export const dynamic = 'force-dynamic'

export default async function ContentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ postId?: string; status?: string; campaignId?: string }>
}) {
  await requireUser()
  const { id } = await params
  const { postId, status, campaignId } = await searchParams

  const product = await findProduct(id)
  if (!product) notFound()

  const [posts, ideas, channelAccounts, campaigns] = await Promise.all([
    listPosts(id),
    listIdeas(id),
    listActiveChannelAccounts(id),
    listCampaigns(id),
  ])

  const publishedPostIds = posts.filter((post) => post.status === 'published').map((post) => post.id)
  const metricEntries = await Promise.all(
    publishedPostIds.map(async (publishedPostId) => [publishedPostId, await getPostMetrics(publishedPostId)] as const),
  )
  const postMetrics = Object.fromEntries(metricEntries)
  const selectedPost = postId ? posts.find((post) => post.id === postId) : null
  const pendingPosts = posts.filter((post) => post.status === 'pending_approval')
  const blockedPosts = pendingPosts.filter(
    (post) => (post.riskReview as RiskReview | null)?.verdict === 'block',
  )
  const actionablePosts = pendingPosts.length - blockedPosts.length
  const selectedPostFilter = selectedPost
    ? selectedPost.status === 'rejected' || selectedPost.status === 'cancelled'
      ? 'archived'
      : selectedPost.status
    : null
  const hasAttentionItems =
    ideas.some((idea) => idea.status === 'proposed') ||
    posts.some((post) => post.status === 'pending_approval' || post.status === 'approved')

  const attention =
    pendingPosts.length > 0
      ? `${actionablePosts} para aprovar${blockedPosts.length > 0 ? ` · ${blockedPosts.length} bloqueado${blockedPosts.length === 1 ? '' : 's'} para editar` : ''}.`
      : posts.length === 0
        ? 'Planeje a semana para criar a primeira fila de conteúdo.'
        : 'Nenhuma revisão pendente agora.'

  return (
    <div className="space-y-6">
      <OperationsHeader
        productId={id}
        productName={product.name}
        currentStep="content"
        state={{
          label: pendingPosts.length > 0 ? 'Revisão pendente' : posts.length > 0 ? 'Fila em dia' : 'Sem conteúdo',
          tone: pendingPosts.length > 0 ? 'warning' : posts.length > 0 ? 'active' : 'neutral',
        }}
        attention={attention}
        nextAction={
          pendingPosts.length > 0
            ? { href: '?status=pending_approval#content-board', label: 'Abrir fila de revisão' }
            : posts.length === 0
              ? { href: '#plan-week', label: 'Planejar conteúdo' }
              : { href: `/products/${id}/campaigns`, label: 'Ver campanhas' }
        }
      />

      <div id="plan-week" className="flex scroll-mt-4 items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-medium">Operação da semana</h2>
          <p className="text-ink-soft mt-1 text-sm">Revise o que exige decisão e acompanhe o restante por estado.</p>
        </div>
        <PlanWeekButton productId={id} />
      </div>

      <div className={selectedPost ? 'grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(340px,420px)]' : ''}>
        <ContentBoard
          productId={id}
          posts={posts}
          ideas={ideas}
          metrics={postMetrics}
          campaigns={campaigns.map((campaign) => ({ id: campaign.id, name: campaign.name }))}
          selectedPostId={selectedPost?.id}
          initialStatus={status ?? selectedPostFilter ?? (hasAttentionItems ? 'attention' : 'all')}
          initialCampaignId={campaignId}
        />

        {selectedPost && (
          <aside aria-label="Revisão do post selecionado" className="order-first min-w-0 xl:order-none">
            <div className="xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)] xl:overflow-y-auto">
              <PostReviewPanel
                key={`${selectedPost.id}:${selectedPost.updatedAt.toISOString()}`}
                post={selectedPost}
                productId={id}
                productUrl={product.url ?? ''}
                channelAccounts={channelAccounts.filter((account) => account.channel === selectedPost.channel)}
              />
            </div>
          </aside>
        )}
      </div>
    </div>
  )
}
