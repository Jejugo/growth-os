import { z } from 'zod'
import { ai } from '@/modules/ai'
import { CHANNEL_CAPABILITIES } from '@/modules/content/types'
import type { ProductBrief } from '../schema'
import type { PositioningVariant } from '../types'

export const PROMPT_VERSION = 'validation.write-post@1'

const postOutputSchema = z.object({
  hook: z.string(),
  body: z.string(),
  cta: z.string().nullable(),
  ctaType: z.enum(['none', 'soft', 'direct']),
})

export type ValidationPostOutput = z.infer<typeof postOutputSchema>

const SYSTEM = `Você é redator de conteúdo para o teste de demanda de uma ideia de produto que ainda não existe. O post aponta para uma landing page de waitlist — o objetivo é gerar inscrição real, não engajamento vazio.

Regras absolutas:
- Escreva estritamente sob o ângulo de posicionamento fornecido — é isso que está sendo testado.
- Nunca repita hook ou CTA de posts anteriores (listados na memória).
- As capacidades do canal (limite de caracteres, tom) são FIXAS.
- hook: a primeira linha que decide se o leitor para.
- cta: sempre "direct" apontando para a lista de espera — este post existe para medir inscrição, não para "soft engagement".
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
}): Promise<{ post: ValidationPostOutput; callId: string; costUsd: number }> {
  const { brief, variant, recentPosts, landingUrl } = input
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
      '</capacidades_do_canal>',
      '',
      `Landing page de inscrição: ${landingUrl}`,
      '',
      '<memoria_de_posts>',
      memoryBlock,
      '</memoria_de_posts>',
      '',
      `Escreva o post para "${channel}" sob o ângulo "${variant.name}".`,
    ].join('\n'),
    context: { productId: input.productId },
    verify: (data) => {
      const issues: string[] = []
      const parts = [data.hook.trim()]
      if (data.body.trim()) parts.push(data.body.trim())
      if (data.cta && data.cta.trim()) parts.push(data.cta.trim())
      const full = parts.join('\n\n')
      const graphemeCount = (() => {
        try {
          return [...new Intl.Segmenter().segment(full)].length
        } catch {
          return full.length
        }
      })()

      if (graphemeCount > caps.maxChars) {
        issues.push(
          `Post excede o limite do canal (${graphemeCount} grafemas vs ${caps.maxChars} permitidos).`,
        )
      }
      if (data.hook.trim().length < 10) {
        issues.push('Hook muito curto.')
      }
      return issues
    },
  })

  return { post: result.data, callId: result.callId, costUsd: result.costUsd }
}
