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
  productName: string
  brief: ProductBrief
  profile: ProductProfile
  /** Presente quando o fundador pediu ajustes numa copy já publicada, em vez de gerar do zero. */
  adjustment?: { previousCopy: LandingPageCopy; note: string }
}): Promise<{ copy: LandingPageCopy; callId: string; costUsd: number }> {
  const { brief, profile, productName, adjustment } = input

  const briefBlock = [
    `Problema: ${brief.problem}`,
    `Audiência: ${brief.audience}`,
    `Esboço de solução: ${brief.solutionSketch}`,
    brief.whyNow ? `Por que agora: ${brief.whyNow}` : '',
    brief.alternatives ? `Alternativas hoje: ${brief.alternatives}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  // Nome real cadastrado pelo usuário — nunca `profile.productName`, que pra ideias é um nome
  // comercial inferido pela IA a partir só do brief (nunca vê o nome real) e pode divergir dele.
  const profileBlock = [
    `Nome do produto: ${productName}`,
    `Uma linha: ${profile.oneLiner ?? ''}`,
    `Proposta de valor: ${profile.valueProposition ?? ''}`,
    `Diferenciais: ${profile.data.differentiators.join(', ') || 'nenhum'}`,
    `Prova social real disponível: ${profile.data.socialProof.join(', ') || 'nenhuma'}`,
  ].join('\n')

  const adjustmentBlock = adjustment
    ? [
        '',
        '<copy_atual>',
        JSON.stringify(adjustment.previousCopy, null, 2),
        '</copy_atual>',
        '',
        '<ajuste_pedido_pelo_fundador>',
        adjustment.note,
        '</ajuste_pedido_pelo_fundador>',
      ].join('\n')
    : ''

  const instruction = adjustment
    ? 'Revise a copy atual acima considerando o ajuste pedido pelo fundador. Mude só o que for necessário para atender o pedido — preserve o resto tal como está.'
    : 'Escreva a copy da landing page de waitlist para esta ideia.'

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
      adjustmentBlock,
      '',
      instruction,
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
