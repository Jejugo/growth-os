import { recordDecision } from '@/lib/observability/service'
import { getCurrentProfile } from '@/modules/products'
import { listSegments } from '@/modules/audiences'
import { planCampaign as planCampaignAI } from './ai/plan-campaign'
import * as repo from './repo'
import type { Campaign, ContentTheme } from './schema'

export class NoPlanError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NoPlanError'
  }
}

/**
 * Planeja uma nova campanha com base no perfil e nos segmentos ativos.
 * Cria a campanha como `draft` — o caller ativa quando estiver pronto.
 */
export async function planNewCampaign(input: {
  productId: string
  audienceSegmentIds?: string[]
  jobRunId?: string
}): Promise<{ campaign: Campaign; themes: ContentTheme[]; costUsd: number }> {
  const { productId } = input

  const profile = await getCurrentProfile(productId)
  if (!profile) {
    throw new NoPlanError(`Produto ${productId} não tem perfil. Rode análise primeiro.`)
  }

  const allSegments = await listSegments(productId)
  const selectedSegments =
    input.audienceSegmentIds && input.audienceSegmentIds.length > 0
      ? allSegments.filter((s) => input.audienceSegmentIds!.includes(s.id))
      : allSegments

  if (selectedSegments.length === 0) {
    throw new NoPlanError(
      `Produto ${productId} não tem segmentos ativos. Derive segmentos primeiro.`,
    )
  }

  const pastCampaigns = await repo.listPastCampaigns(productId, 5)

  const { campaign: planned, callId, costUsd } = await planCampaignAI({
    productId,
    profile,
    segments: selectedSegments,
    pastCampaigns,
  })

  const campaign = await repo.insertCampaign({
    productId,
    name: planned.name,
    bigIdea: planned.bigIdea,
    hypothesis: planned.hypothesis,
    audienceSegmentIds: selectedSegments.map((s) => s.id),
  })

  const themes = await repo.insertThemes(productId, campaign.id, planned.themes)

  await recordDecision({
    productId,
    actor: 'content-planner',
    decision: 'PLAN_CAMPAIGN',
    rationale: `Campanha "${campaign.name}" criada com hipótese: "${campaign.hypothesis.slice(0, 120)}..."`,
    aiCallId: callId,
    jobRunId: input.jobRunId,
  })

  return { campaign, themes, costUsd }
}

export async function activateCampaign(campaignId: string): Promise<void> {
  await repo.activateCampaign(campaignId)
}

/**
 * Cria uma campanha já ativa com um único tema, sem passar pelo planejador de
 * IA. Usado pela fase 4.5: uma validação precisa de um agrupador de conteúdo
 * mínimo, não de uma campanha completa com múltiplos temas.
 */
export async function createCampaignWithTheme(input: {
  productId: string
  name: string
  bigIdea: string
  hypothesis: string
  theme: { name: string; description: string; keywords: string[] }
}): Promise<{ campaign: Campaign; theme: ContentTheme }> {
  const campaign = await repo.insertCampaign({
    productId: input.productId,
    name: input.name,
    bigIdea: input.bigIdea,
    hypothesis: input.hypothesis,
    audienceSegmentIds: [],
  })
  await repo.activateCampaign(campaign.id)
  const [theme] = await repo.insertThemes(input.productId, campaign.id, [input.theme])
  return { campaign, theme: theme! }
}

export { listCampaigns, findCampaign, findActiveCampaign, listThemes } from './repo'
