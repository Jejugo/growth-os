import { z } from 'zod'
import { ai } from '@/modules/ai'
import { CHANNEL_CAPABILITIES } from '@/modules/content/types'
import type { ProductBrief } from '../schema'
import type { PositioningVariant } from '../types'

export const PROMPT_VERSION = 'validation.write-post@2'

const postOutputSchema = z.object({
  hook: z.string(),
  body: z.string(),
  cta: z.string().nullable(),
  ctaType: z.enum(['none', 'soft', 'direct']),
})

export type ValidationPostOutput = z.infer<typeof postOutputSchema>

function graphemeCount(text: string): number {
  try {
    return [...new Intl.Segmenter().segment(text)].length
  } catch {
    return text.length
  }
}

function joinedLength(hook: string, body: string, cta: string | null): number {
  const parts = [hook.trim()]
  if (body.trim()) parts.push(body.trim())
  if (cta && cta.trim()) parts.push(cta.trim())
  return graphemeCount(parts.join('\n\n'))
}

function splitSentences(text: string): string[] {
  const trimmed = text.trim()
  return trimmed ? trimmed.split(/(?<=[.!?])\s+/) : []
}

/**
 * O prompt já pede pra respeitar o limite de grafemas do canal, mas testes mostraram
 * o modelo estourando de forma consistente (300+ grafemas) mesmo depois de corrigido
 * com o excesso exato — ver "Gerar posts para todos os ângulos" em docs/backlog.md.
 * Em vez de descartar o post inteiro, corta frases inteiras do fim do body até caber.
 */
function fitToChannelBudget(post: ValidationPostOutput, maxChars: number): ValidationPostOutput {
  if (joinedLength(post.hook, post.body, post.cta) <= maxChars) return post

  const sentences = splitSentences(post.body)
  let body = sentences.join(' ')
  while (sentences.length > 0 && joinedLength(post.hook, body, post.cta) > maxChars) {
    sentences.pop()
    body = sentences.join(' ')
  }

  return { ...post, body }
}

const SYSTEM = `Você é redator de conteúdo para o teste de demanda de uma ideia de produto que ainda não existe. O post aponta para uma landing page de waitlist — o objetivo é gerar inscrição real, não engajamento vazio.

Regras absolutas:
- Escreva estritamente sob o ângulo de posicionamento fornecido — é isso que está sendo testado.
- Nunca repita hook ou CTA de posts anteriores (listados na memória).
- As capacidades do canal (limite de caracteres, tom) são FIXAS.
- hook: a primeira linha que decide se o leitor para.
- cta: sempre "direct" apontando para a lista de espera — este post existe para medir inscrição, não para "soft engagement".
- cta nunca contém uma URL — é só o texto da chamada (ex.: "Entre na lista de espera"). O link é adicionado separadamente pelo sistema, como link rastreável; uma URL escrita aqui vira um segundo link solto, sem rastreamento, duplicado.
- IMPORTANTE: o limite de caracteres é para hook + body + cta juntos.
- Não prometa que o produto já existe ou já funciona — é uma ideia em teste. Seja honesto sobre isso sem soar hesitante.
- Não mencione preço — a ideia não tem preço definido ainda.`

export async function writeValidationPost(input: {
  productId: string
  brief: ProductBrief
  variant: PositioningVariant
  channel: string
  landingUrl: string
  recentPosts: Array<{ hook: string; cta: string | null }>
  /** Motivo do risk review anterior (`reasons` + `suggestedFix`), quando é uma reescrita. */
  feedback?: string
}): Promise<{ post: ValidationPostOutput; callId: string; costUsd: number }> {
  const { brief, variant, recentPosts, landingUrl, feedback } = input
  const channel = input.channel as keyof typeof CHANNEL_CAPABILITIES
  const caps = CHANNEL_CAPABILITIES[channel]
  if (!caps) throw new Error(`Canal desconhecido: ${channel}`)

  const memoryBlock =
    recentPosts.length > 0
      ? recentPosts.map((p) => `Hook: "${p.hook}"`).join('\n')
      : 'Nenhum post anterior.'

  const briefBlock = [
    `Problema: ${brief.problem}`,
    `Audiência: ${brief.audience}`,
    `Esboço de solução: ${brief.solutionSketch}`,
  ].join('\n')

  const blueskyHint = channel === 'bluesky'
    ? '\n\n⚠️ BLUESKY: LIMITE DURO DE 300 GRAFEMAS somando hook + body + cta (mais as quebras de linha entre eles). Respeite estes orçamentos por campo, com folga — não use o máximo: hook ≤ 40 grafemas, body ≤ 150 grafemas, cta ≤ 40 grafemas. Se precisar cortar, corte uma frase inteira do body — não tente economizar palavra por palavra.'
    : ''

  const feedbackBlock = feedback
    ? [
        '',
        '<correcao_solicitada>',
        'Este post já foi escrito e revisado antes — a revisão de risco sinalizou os problemas abaixo.',
        'Reescreva o post do zero, sob o mesmo ângulo, corrigindo isso:',
        feedback,
        '</correcao_solicitada>',
      ].join('\n')
    : ''

  const result = await ai().generateStructured({
    task: 'validation.write-post',
    promptVersion: PROMPT_VERSION,
    tier: 'standard',
    schema: postOutputSchema,
    system: SYSTEM,
    prompt: [
      '<brief>',
      briefBlock,
      '</brief>',
      '',
      '<angulo_obrigatorio>',
      `${variant.name}: ${variant.positioningAngle}`,
      '</angulo_obrigatorio>',
      '',
      '<capacidades_do_canal>',
      `Canal: ${channel}`,
      `Máximo de grafemas (hook + body + cta juntos): ${caps.maxChars}`,
      `Tom: ${caps.tone}`,
      `Notas: ${caps.notes}`,
      blueskyHint,
      '</capacidades_do_canal>',
      '',
      `Landing page de inscrição: ${landingUrl}`,
      '',
      '<memoria_de_posts>',
      memoryBlock,
      '</memoria_de_posts>',
      feedbackBlock,
      '',
      `Escreva o post para "${channel}" sob o ângulo "${variant.name}".`,
    ].join('\n'),
    context: { productId: input.productId },
    verify: (data) => {
      const issues: string[] = []
      if (data.hook.trim().length < 10) {
        issues.push('Hook muito curto.')
      }
      if (data.cta && /https?:\/\//i.test(data.cta)) {
        issues.push('cta contém uma URL — o link é adicionado separadamente pelo sistema, nunca escreva um aqui.')
      }
      return issues
    },
  })

  const post = fitToChannelBudget(result.data, caps.maxChars)
  return { post, callId: result.callId, costUsd: result.costUsd }
}
