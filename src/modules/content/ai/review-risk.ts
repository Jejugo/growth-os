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

/**
 * Sem isso, todo post de validação sai "flag" — o critério acima foi pensado pro produto já
 * lançado, com diferenciais e prova social no perfil. Na validação (fase 4.5) o produto ainda não
 * existe, o perfil não tem nada disso por definição, e o post PRECISA ser chamativo (é um teste de
 * demanda) — sem este ajuste, "tom promocional" e "claim sem prova social" disparam sempre.
 */
const VALIDATION_ADDENDUM = `

Contexto especial deste post: é um TESTE DE DEMANDA de uma ideia que ainda não existe (fase de
validação, não o produto lançado). Isso muda o que conta como risco:
- Claims sobre a capacidade FUTURA do produto são esperadas e aceitáveis, desde que plausíveis —
  NÃO marque "tom promocional" nem "claim sem prova social" como problema aqui; isso é normal e
  intencional em copy de teste de demanda.
- Reserve "flag"/"block" para: promessa de resultado numérico específico (%, ROI, tempo exato) sem
  nenhuma base, claim tecnicamente impossível, ou linguagem que sugira que o produto já existe e já
  está em uso por clientes (ele não existe ainda — isso sim é enganoso).`

export async function reviewRisk(input: {
  productId: string
  post: SocialPost
  profile: ProductProfile
  /** Post de teste de demanda (fase 4.5) — critério de risco é diferente do produto já lançado. */
  isValidation?: boolean
}): Promise<{ review: RiskReview; callId: string; costUsd: number }> {
  const { post, profile, isValidation = false } = input

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
    promptVersion: isValidation ? `${PROMPT_VERSION}+validation` : PROMPT_VERSION,
    tier: 'strong',
    schema: riskReviewSchema,
    system: isValidation ? SYSTEM + VALIDATION_ADDENDUM : SYSTEM,
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
