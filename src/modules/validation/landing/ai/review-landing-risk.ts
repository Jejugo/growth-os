import { ai } from '@/modules/ai'
import { riskReviewSchema, type RiskReview } from '@/modules/content/types'
import type { ProductProfile } from '@/modules/products/schema'
import type { LandingPageCopy } from '../types'

export const PROMPT_VERSION = 'validation.review-landing-risk@1'

/**
 * Mesmos critérios de `content/ai/review-risk.ts`, adaptados ao formato de
 * landing page. O relaxamento de "tom promocional"/"claim sem prova social"
 * (ver `VALIDATION_ADDENDUM` de review-risk.ts) é sempre aplicado aqui — uma
 * landing de validação É sempre um teste de demanda, nunca o produto lançado.
 */
const SYSTEM = `Você é revisor de risco de conteúdo para SaaS. Avalia a copy de uma landing page de teste de demanda antes de publicar.

Vereditos:
- "pass": a copy está dentro dos limites — pode publicar.
- "flag": há pontos de atenção, mas a copy não é problemática em si.
- "block": a copy tem um problema sério que deve ser corrigido antes de publicar.

Contexto especial: esta página é um TESTE DE DEMANDA de uma ideia que ainda não existe. Isso muda o
que conta como risco:
- Claims sobre a capacidade FUTURA do produto são esperadas e aceitáveis, desde que plausíveis —
  NÃO marque "tom promocional" como problema aqui; isso é normal e intencional em copy de teste de
  demanda.
- Reserve "flag"/"block" para: promessa de resultado numérico específico (%, ROI, tempo exato) sem
  nenhuma base, claim tecnicamente impossível, "socialProofLine" preenchida sem prova social real
  nos fatos do produto, ou qualquer linguagem que sugira que o produto já existe e já está em uso
  por clientes (ele não existe ainda — isso sim é enganoso).

Em "reasons", liste os problemas específicos encontrados. Em "suggestedFix", ofereça uma correção
concisa quando o problema for simples de resolver.`

export async function reviewLandingPageRisk(input: {
  productId: string
  productName: string
  copy: LandingPageCopy
  profile: ProductProfile
}): Promise<{ review: RiskReview; callId: string; costUsd: number }> {
  const { copy, profile, productName } = input

  const factsBlock = [
    `Produto: ${productName}`,
    `Proposta de valor: ${profile.valueProposition ?? ''}`,
    `Diferenciais comprovados pelo perfil: ${profile.data.differentiators.join(', ') || 'nenhum'}`,
    `Prova social: ${profile.data.socialProof.join(', ') || 'nenhuma'}`,
  ].join('\n')

  const copyBlock = [
    `Headline: ${copy.headline}`,
    `Subheadline: ${copy.subheadline}`,
    `Benefícios:\n${copy.benefits.map((b) => `- ${b.title}: ${b.description}`).join('\n')}`,
    copy.socialProofLine ? `Linha de prova social: ${copy.socialProofLine}` : 'Sem linha de prova social.',
    `CTA: ${copy.ctaText}${copy.ctaMicrocopy ? ` (microcopy: ${copy.ctaMicrocopy})` : ''}`,
  ].join('\n')

  const result = await ai().generateStructured({
    task: 'validation.review-landing-risk',
    promptVersion: PROMPT_VERSION,
    tier: 'strong',
    schema: riskReviewSchema,
    system: SYSTEM,
    prompt: [
      '<fatos_do_produto>',
      factsBlock,
      '</fatos_do_produto>',
      '',
      '<copy_para_revisao>',
      copyBlock,
      '</copy_para_revisao>',
      '',
      'Avalie o risco desta landing page.',
    ].join('\n'),
    context: { productId: input.productId },
  })

  return { review: result.data, callId: result.callId, costUsd: result.costUsd }
}
