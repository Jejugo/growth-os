import { ai } from '@/modules/ai'
import { planCampaignOutputSchema, type PlanCampaignOutput } from '../types'
import type { ProductProfile } from '@/modules/products/schema'
import type { AudienceSegment } from '@/modules/audiences/schema'
import type { Campaign } from '../schema'

export const PROMPT_VERSION = 'campaigns.plan-campaign@1'

const SYSTEM = `Você é estrategista de conteúdo para SaaS. A partir de um perfil de produto e segmentos de audiência, planeja uma campanha de conteúdo coerente.

Regras:
- bigIdea: o conceito central que une toda a campanha. Uma frase marcante.
- hypothesis: OBRIGATORIAMENTE no formato "Se [mensagem] para [audiência], então [resultado] porque [razão]".
  Exemplo: "Se mostrarmos como reduzir onboarding de SaaS para founders técnicos que vendem para PMEs,
  então eles vão se inscrever no trial porque o problema de ativação é o que os impede de escalar."
  A hipótese é o que a fase 4 vai avaliar — sem ela, não há aprendizado.
- themes: 3 a 5 temas de conteúdo distintos que cobrem ângulos diferentes da big idea.
  Cada tema deve ter 3–5 keywords relevantes para SEO e busca.
- Não repita a big idea de campanhas anteriores (serão informadas se existirem).`

export async function planCampaign(input: {
  productId: string
  profile: ProductProfile
  segments: AudienceSegment[]
  pastCampaigns: Campaign[]
}): Promise<{ campaign: PlanCampaignOutput; callId: string; costUsd: number }> {
  const { profile, segments, pastCampaigns } = input

  const profileBlock = [
    `Produto: ${profile.productName ?? 'desconhecido'}`,
    `Uma linha: ${profile.oneLiner ?? ''}`,
    `Problema principal: ${profile.primaryProblem ?? ''}`,
    `Proposta de valor: ${profile.valueProposition ?? ''}`,
    `Diferenciais: ${profile.data.differentiators.join(', ') || 'nenhum'}`,
    `Temas de conteúdo do perfil: ${profile.data.contentThemes.join(', ') || 'nenhum'}`,
  ].join('\n')

  const segmentsBlock = segments
    .map(
      (s) =>
        `• ${s.name} — ${s.description}\n  Dores: ${s.painPoints.join(', ')}`,
    )
    .join('\n')

  const pastBlock =
    pastCampaigns.length > 0
      ? pastCampaigns.map((c) => `• ${c.name}: "${c.bigIdea}"`).join('\n')
      : 'Nenhuma campanha anterior.'

  const result = await ai().generateStructured({
    task: 'campaigns.plan-campaign',
    promptVersion: PROMPT_VERSION,
    tier: 'strong',
    schema: planCampaignOutputSchema,
    system: SYSTEM,
    prompt: [
      '<perfil_do_produto>',
      profileBlock,
      '</perfil_do_produto>',
      '',
      '<segmentos_alvo>',
      segmentsBlock,
      '</segmentos_alvo>',
      '',
      '<campanhas_anteriores>',
      pastBlock,
      '</campanhas_anteriores>',
      '',
      'Planeje a próxima campanha de conteúdo.',
    ].join('\n'),
    context: { productId: input.productId },
    verify: (data) => {
      const issues: string[] = []

      if (data.hypothesis.trim().length < 50) {
        issues.push('A hipótese está curta demais para ser testável.')
      }
      if (!data.hypothesis.toLowerCase().includes('se ') && !data.hypothesis.toLowerCase().includes('if ')) {
        issues.push('A hipótese deve começar com "Se" e seguir o formato especificado.')
      }
      if (data.themes.length < 3 || data.themes.length > 5) {
        issues.push('São necessários entre 3 e 5 temas.')
      }

      const pastBigIdeas = pastCampaigns.map((c) => c.bigIdea.toLowerCase())
      if (pastBigIdeas.some((bi) => bi === data.bigIdea.toLowerCase())) {
        issues.push('A big idea repete uma campanha anterior.')
      }

      return issues
    },
  })

  return { campaign: result.data, callId: result.callId, costUsd: result.costUsd }
}
