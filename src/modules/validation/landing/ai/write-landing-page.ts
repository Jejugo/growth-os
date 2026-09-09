import { ai } from '@/modules/ai'
import { landingPageCopySchema, type LandingPageCopy } from '../types'
import type { ProductBrief } from '../../schema'
import type { ProductProfile } from '@/modules/products/schema'

export const PROMPT_VERSION = 'validation.write-landing-page@1'

const SYSTEM = `Você é redator de landing page para o teste de demanda de uma ideia de produto que ainda não existe. A página existe pra medir inscrição real numa lista de espera, não pra impressionar.

Regras absolutas:
- Não prometa que o produto já existe ou já funciona — é uma ideia em teste. Seja honesto sobre isso sem soar hesitante ou incerto.
- Não mencione preço — a ideia não tem preço definido ainda.
- "socialProofLine" só pode ter conteúdo se os fatos do produto trouxerem prova social real (usuários, dados, menções). Sem isso nos fatos, retorne null — nunca invente.
- "benefits": cada um é um resultado concreto pra pessoa, não uma feature genérica. Evite jargão corporativo.
- "headline": a frase que decide se a pessoa continua lendo. Curta, direta, sob o problema real — não o nome do produto.
- "ctaText": sempre voltado a entrar na lista de espera (é o único objetivo da página).`

export async function writeLandingPageCopy(input: {
  productId: string
  brief: ProductBrief
  profile: ProductProfile
}): Promise<{ copy: LandingPageCopy; callId: string; costUsd: number }> {
  const { brief, profile } = input

  const briefBlock = [
    `Problema: ${brief.problem}`,
    `Audiência: ${brief.audience}`,
    `Esboço de solução: ${brief.solutionSketch}`,
    brief.whyNow ? `Por que agora: ${brief.whyNow}` : '',
    brief.alternatives ? `Alternativas hoje: ${brief.alternatives}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  const profileBlock = [
    `Nome do produto: ${profile.productName ?? ''}`,
    `Uma linha: ${profile.oneLiner ?? ''}`,
    `Proposta de valor: ${profile.valueProposition ?? ''}`,
    `Diferenciais: ${profile.data.differentiators.join(', ') || 'nenhum'}`,
    `Prova social real disponível: ${profile.data.socialProof.join(', ') || 'nenhuma'}`,
  ].join('\n')

  const result = await ai().generateStructured({
    task: 'validation.write-landing-page',
    promptVersion: PROMPT_VERSION,
    tier: 'standard',
    schema: landingPageCopySchema,
    system: SYSTEM,
    prompt: [
      '<brief>',
      briefBlock,
      '</brief>',
      '',
      '<perfil_do_produto>',
      profileBlock,
      '</perfil_do_produto>',
      '',
      'Escreva a copy da landing page de waitlist para esta ideia.',
    ].join('\n'),
    context: { productId: input.productId },
    verify: (data) => {
      const issues: string[] = []
      if (data.socialProofLine && profile.data.socialProof.length === 0) {
        issues.push('socialProofLine foi preenchido mas o perfil não tem nenhuma prova social real — deve ser null.')
      }
      if (data.headline.trim().length < 10) {
        issues.push('Headline muito curta.')
      }
      return issues
    },
  })

  return { copy: result.data, callId: result.callId, costUsd: result.costUsd }
}
