import { ai } from '@/modules/ai'
import { riskReviewSchema, type RiskReview } from '../types'
import type { ProductProfile } from '@/modules/products/schema'
import type { SocialPost } from '../schema'

export const PROMPT_VERSION = 'content.review-risk@1'

const SYSTEM = `Você é revisor de risco de conteúdo para SaaS. Avalia posts antes de qualquer aprovação humana.

Vereditos:
- "pass": o post está dentro dos limites — pode prosseguir.
- "flag": há pontos de atenção que o humano deve revisar, mas o post não é problemático em si.
- "block": o post tem um problema sério que deve ser corrigido antes de qualquer aprovação.
  Um post "block" NÃO pode ser aprovado sem edição — informe isso na UI.

O que verificar:
1. Claims factuais: o post afirma algo que o perfil do produto não sustenta?
2. Promessas de resultado: "você vai [resultado garantido]", percentuais sem fonte, ROI prometido?
3. Dado sem fonte: estatística ou pesquisa citada sem base nos fatos fornecidos?
4. Comparação direta com concorrente nomeado de forma depreciativa?
5. Tom automatizado ou excessivamente promocional para o canal?
6. Linguagem de spam: "exclusivo", "garantido", "incrível", "revolucionário" sem substância?
7. Adequação cultural ao canal: um post de Reddit que soa como anúncio, por exemplo?

Em "reasons", liste os problemas específicos encontrados. Em "suggestedFix", ofereça uma correção
concisa quando o problema for simples de resolver. Seja específico — "tom inadequado" não ajuda;
"segunda frase soa como anúncio de banner; remova o superlativo 'incrível'" ajuda.`

export async function reviewRisk(input: {
  productId: string
  post: SocialPost
  profile: ProductProfile
}): Promise<{ review: RiskReview; callId: string; costUsd: number }> {
  const { post, profile } = input

  const factsBlock = [
    `Produto: ${profile.productName ?? ''}`,
    `Uma linha: ${profile.oneLiner ?? ''}`,
    `Problema que resolve: ${profile.primaryProblem ?? ''}`,
    `Proposta de valor: ${profile.valueProposition ?? ''}`,
    `Preços: ${profile.pricingSummary ?? 'não divulgado'}`,
    `Diferenciais comprovados pelo perfil: ${profile.data.differentiators.join(', ') || 'nenhum'}`,
    `Prova social: ${profile.data.socialProof.join(', ') || 'nenhuma'}`,
  ].join('\n')

  const postBlock = [
    `Canal: ${post.channel}`,
    `Hook: ${post.hook}`,
    `Body:\n${post.body}`,
    post.cta ? `CTA: ${post.cta} (tipo: ${post.ctaType})` : 'Sem CTA.',
  ].join('\n')

  const result = await ai().generateStructured({
    task: 'content.review-risk',
    promptVersion: PROMPT_VERSION,
    tier: 'strong',
    schema: riskReviewSchema,
    system: SYSTEM,
    prompt: [
      '<fatos_do_produto>',
      factsBlock,
      '</fatos_do_produto>',
      '',
      '<post_para_revisao>',
      postBlock,
      '</post_para_revisao>',
      '',
      'Avalie o risco deste post. Seja honesto — um "pass" para tudo não protege o produto.',
    ].join('\n'),
    context: { productId: input.productId },
  })

  return { review: result.data, callId: result.callId, costUsd: result.costUsd }
}
