import { notFound } from 'next/navigation'
import { requireUser } from '@/server/guard'
import { findProduct } from '@/modules/products'
import { listCampaigns, listThemes } from '@/modules/campaigns'
import { listPosts } from '@/modules/content'
import { getPostMetrics } from '@/modules/attribution/repo'

export const dynamic = 'force-dynamic'

export default async function CampaignsPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser()
  const { id } = await params

  const product = await findProduct(id)
  if (!product) notFound()

  const campaigns = await listCampaigns(id)

  return (
    <div className="space-y-6">
      <div className="border-line border-b pb-4">
        <h1 className="text-xl font-semibold">{product.name}</h1>
      </div>

      <div>
        <h2 className="text-lg font-medium">Campanhas</h2>
        <p className="text-ink-soft mt-1 text-sm">
          Campanhas são criadas automaticamente pelo planejador de semana. Cada uma tem uma big
          idea e uma hipótese testável.
        </p>
      </div>

      {campaigns.length === 0 ? (
        <div className="border-line text-ink-soft rounded-md border border-dashed p-10 text-center text-sm">
          Nenhuma campanha ainda. Use "Planejar semana" na aba Conteúdo para criar a primeira.
        </div>
      ) : (
        <div className="space-y-4">
          {campaigns.map((campaign) => (
            <CampaignCard key={campaign.id} productId={id} campaign={campaign} />
          ))}
        </div>
      )}
    </div>
  )
}

async function CampaignCard({
  campaign,
  productId,
}: {
  campaign: Awaited<ReturnType<typeof listCampaigns>>[number]
  productId: string
}) {
  const [themes, posts] = await Promise.all([
    listThemes(campaign.id),
    listPosts(productId, campaign.id),
  ])

  const metrics = await Promise.all(posts.map((p) => getPostMetrics(p.id)))
  const clicks = metrics.reduce((sum, m) => sum + m.clicks, 0)
  const signups = metrics.reduce((sum, m) => sum + m.signups, 0)
  const conversionRate = clicks > 0 ? Math.round((signups / clicks) * 10000) / 100 : 0

  const inactive = campaign.status === 'completed' || campaign.status === 'paused'

  return (
    <div className={`border-line flex flex-col gap-3.5 rounded-md border p-4 ${inactive ? 'opacity-70' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-medium">{campaign.name}</h3>
            <StatusBadge status={campaign.status} />
          </div>
          <p className="text-accent-2 mt-1.5 text-sm leading-snug italic">{campaign.bigIdea}</p>
        </div>
        <span className="text-ink-faint shrink-0 font-mono text-xs">
          criada {campaign.createdAt.toLocaleDateString('pt-BR')}
        </span>
      </div>

      <div className="border-line rounded-md border p-3">
        <p className="card-kicker mb-1.5">Hipótese</p>
        <p className="text-sm leading-relaxed">{campaign.hypothesis}</p>
      </div>

      {themes.length > 0 && (
        <div>
          <p className="card-kicker mb-2">Temas de conteúdo</p>
          <div className="flex flex-wrap gap-2">
            {themes.map((theme) => (
              <div
                key={theme.id}
                className="border-line rounded-md border px-3 py-2 text-sm"
                title={theme.description}
              >
                <span className="font-medium">{theme.name}</span>
                {theme.keywords.length > 0 && (
                  <span className="text-ink-faint ml-2 text-xs">
                    {theme.keywords.slice(0, 3).join(', ')}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {posts.length > 0 && (
        <div className="border-line text-ink-faint flex items-center gap-5 border-t pt-3.5 font-mono text-xs">
          <span>{posts.length} posts</span>
          <span>{clicks} cliques</span>
          <span>{signups} signups</span>
          {clicks > 0 && <span className="text-ok">{conversionRate}% conversão</span>}
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: 'tag-neutral',
    active: 'text-ok border border-ok/35',
    paused: 'tag-neutral',
    completed: 'tag-neutral',
  }
  const labels: Record<string, string> = {
    draft: 'rascunho',
    active: 'ativa',
    paused: 'pausada',
    completed: 'concluída',
  }
  return (
    <span className={`tag font-mono ${styles[status] ?? 'tag-neutral'}`}>
      {labels[status] ?? status}
    </span>
  )
}
