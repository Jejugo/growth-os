import { notFound } from 'next/navigation'
import { requireUser } from '@/server/guard'
import { findProduct } from '@/modules/products'
import { listCampaigns, listThemes } from '@/modules/campaigns'
import { listPosts } from '@/modules/content'
import { getPostMetrics } from '@/modules/attribution/repo'
import { OperationsHeader } from '../_components/operations-header'

export const dynamic = 'force-dynamic'

export default async function CampaignsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ q?: string; status?: string }>
}) {
  await requireUser()
  const { id } = await params
  const { q = '', status = 'all' } = await searchParams

  const product = await findProduct(id)
  if (!product) notFound()

  const campaigns = await listCampaigns(id)
  const normalizedQuery = q.trim().toLocaleLowerCase('pt-BR')
  const filteredCampaigns = campaigns.filter((campaign) => {
    const matchesStatus = status === 'all' || campaign.status === status
    const haystack = `${campaign.name} ${campaign.bigIdea} ${campaign.hypothesis}`.toLocaleLowerCase('pt-BR')
    return matchesStatus && (!normalizedQuery || haystack.includes(normalizedQuery))
  })
  const activeCampaigns = campaigns.filter((campaign) => campaign.status === 'active')
  const nextCampaign = activeCampaigns[0] ?? campaigns[0]

  return (
    <div className="space-y-6">
      <OperationsHeader
        productId={id}
        productName={product.name}
        currentStep="campaigns"
        state={{
          label: activeCampaigns.length > 0 ? `${activeCampaigns.length} ativa${activeCampaigns.length === 1 ? '' : 's'}` : campaigns.length > 0 ? 'Sem campanha ativa' : 'Sem campanhas',
          tone: activeCampaigns.length > 0 ? 'active' : campaigns.length > 0 ? 'warning' : 'neutral',
        }}
        attention={
          campaigns.length === 0
            ? 'Planeje a semana em Conteúdo para criar a primeira campanha.'
            : activeCampaigns.length > 0
              ? 'Nenhuma decisão pendente; acompanhe a hipótese e os posts da campanha ativa.'
              : 'Revise em Conteúdo se já existe material pronto para a próxima campanha.'
        }
        nextAction={
          nextCampaign
            ? { href: `/products/${id}/content?campaignId=${nextCampaign.id}`, label: 'Ver conteúdo relacionado' }
            : { href: `/products/${id}/content#plan-week`, label: 'Planejar conteúdo' }
        }
      />

      <div>
        <h2 className="text-lg font-medium">Campanhas</h2>
        <p className="text-ink-soft mt-1 text-sm">
          Campanhas são criadas automaticamente pelo planejador de semana. Cada uma tem uma big
          idea e uma hipótese testável.
        </p>
      </div>

      {campaigns.length > 0 && (
        <form className="border-line grid gap-2 border-y py-3 sm:grid-cols-[minmax(220px,1fr)_180px_auto]">
          <label>
            <span className="sr-only">Buscar campanhas</span>
            <input name="q" type="search" defaultValue={q} placeholder="Buscar campanha ou hipótese" className="input" />
          </label>
          <label>
            <span className="sr-only">Filtrar campanha por status</span>
            <select name="status" defaultValue={status} className="input">
              <option value="all">Todos os estados</option>
              <option value="draft">Rascunhos</option>
              <option value="active">Ativas</option>
              <option value="paused">Pausadas</option>
              <option value="completed">Concluídas</option>
            </select>
          </label>
          <button type="submit" className="btn btn-secondary">Filtrar</button>
        </form>
      )}

      {campaigns.length === 0 ? (
        <div className="border-line text-ink-soft rounded-md border border-dashed p-10 text-center text-sm">
          Nenhuma campanha ainda. Use &ldquo;Planejar semana&rdquo; na aba Conteúdo para criar a primeira.
        </div>
      ) : filteredCampaigns.length === 0 ? (
        <div className="border-line text-ink-soft rounded-md border border-dashed p-8 text-center text-sm">
          Nenhuma campanha corresponde aos filtros.
        </div>
      ) : (
        <div className="space-y-4">
          {filteredCampaigns.map((campaign) => (
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
    <div className={`surface-elevated flex flex-col gap-3.5 rounded-lg p-4 ${inactive ? 'opacity-70' : ''}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
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

      <div className="space-y-1 pt-1">
        <p className="text-ink-faint text-xs font-medium">Hipótese</p>
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
