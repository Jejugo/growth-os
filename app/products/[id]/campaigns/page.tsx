import { notFound } from 'next/navigation'
import { requireUser } from '@/server/guard'
import { findProduct } from '@/modules/products'
import { listCampaigns, listThemes } from '@/modules/campaigns'
import { ProductNav } from '../_components/product-nav'

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

      <ProductNav productId={id} active="campaigns" />

      <div>
        <h2 className="text-lg font-medium">Campanhas</h2>
        <p className="text-ink-soft mt-1 text-sm">
          Campanhas são criadas automaticamente pelo planejador de semana. Cada uma tem uma big
          idea e uma hipótese testável.
        </p>
      </div>

      {campaigns.length === 0 ? (
        <div className="panel text-ink-soft p-10 text-center text-sm">
          Nenhuma campanha ainda. Use "Planejar semana" na aba Conteúdo para criar a primeira.
        </div>
      ) : (
        <div className="space-y-6">
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
  const themes = await listThemes(campaign.id)

  return (
    <div className="panel space-y-4 p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">{campaign.name}</h3>
            <StatusBadge status={campaign.status} />
          </div>
          <p className="text-accent mt-1 text-sm italic">{campaign.bigIdea}</p>
        </div>
        <span className="text-ink-faint shrink-0 font-mono text-xs">
          {campaign.createdAt.toLocaleDateString('pt-BR')}
        </span>
      </div>

      <div className="border-line rounded-md border p-3">
        <p className="label-xs mb-1">Hipótese</p>
        <p className="text-ink-soft text-sm leading-relaxed">{campaign.hypothesis}</p>
      </div>

      {themes.length > 0 && (
        <div>
          <p className="label-xs mb-2">Temas de conteúdo</p>
          <div className="flex flex-wrap gap-2">
            {themes.map((theme) => (
              <div
                key={theme.id}
                className="border-line rounded-lg border px-3 py-2 text-sm"
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
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: 'bg-surface-dim text-ink-faint',
    active: 'bg-ok/10 text-ok',
    paused: 'bg-warn/10 text-warn',
    completed: 'text-ink-faint bg-surface-dim',
  }
  return (
    <span
      className={`rounded px-1.5 py-0.5 font-mono text-xs ${styles[status] ?? 'text-ink-faint'}`}
    >
      {status}
    </span>
  )
}
