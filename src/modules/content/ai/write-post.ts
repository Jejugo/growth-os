import { z } from 'zod'
import { ai } from '@/modules/ai'
import { CHANNEL_CAPABILITIES } from '../types'
import type { ProductProfile } from '@/modules/products/schema'
import type { AudienceSegment } from '@/modules/audiences/schema'
import type { ContentIdea } from '../schema'

export const PROMPT_VERSION = 'content.write-post@1'

const postOutputSchema = z.object({
  hook: z.string(),
  body: z.string(),
  cta: z.string().nullable(),
  ctaType: z.enum(['none', 'soft', 'direct']),
})

export type PostOutput = z.infer<typeof postOutputSchema>

const SYSTEM = `Você é redator de conteúdo para SaaS. Escreve posts para canais específicos com base em ideias, perfil do produto e memória de posts anteriores.

Regras absolutas:
- Nunca repita hook, argumento principal ou CTA de posts anteriores (listados na memória).
- As capacidades do canal (limite de caracteres, tom) são FIXAS — nunca as invente ou ignore.
- hook: a primeira linha que decide se o leitor para. Não comece com "Eu" ou o nome do produto.
- body: o desenvolvimento do argumento.
- cta: chamada para ação, se houver. "none" = sem CTA, "soft" = engajamento, "direct" = conversão.
- IMPORTANTE: o limite de caracteres é para o POST COMPLETO montado como "hook\\n\\nbody\\n\\ncta". Todos os campos juntos devem caber no limite.
- Para canais com limite apertado (ex: Bluesky 300 chars), prefira hook curto + body curto que encaixem no total, ou omita o CTA.
- Não mencione preços, features específicas ou claims que o perfil não sustente.
- Tom conforme o canal — Reddit e Bluesky são antipromotores por natureza.`

export async function writePost(input: {
  productId: string
  profile: ProductProfile
  idea: ContentIdea
  segment: AudienceSegment
  channel: ContentIdea['audienceSegmentId'] extends string ? string : string
  recentPosts: Array<{ hook: string; body: string; cta: string | null; channel: string; rejectionReason: string | null }>
  rejectionReasons: string[]
}): Promise<{ post: PostOutput; callId: string; costUsd: number }> {
  const { profile, idea, segment, recentPosts, rejectionReasons } = input
  const channel = input.channel as keyof typeof CHANNEL_CAPABILITIES
  const caps = CHANNEL_CAPABILITIES[channel]

  if (!caps) {
    throw new Error(`Canal desconhecido: ${channel}`)
  }

  const memoryBlock =
    recentPosts.length > 0
      ? recentPosts
          .slice(0, 20)
          .map(
            (p) =>
              `[${p.channel}] Hook: "${p.hook}"${p.rejectionReason ? ` [rejeitado: ${p.rejectionReason}]` : ''}`,
          )
          .join('\n')
      : 'Nenhum post anterior.'

  const rejectionBlock =
    rejectionReasons.length > 0
      ? `Motivos de rejeição anteriores (evitar):\n${rejectionReasons.map((r) => `• ${r}`).join('\n')}`
      : ''

  const profileBlock = [
    `Produto: ${profile.productName ?? ''}`,
    `Uma linha: ${profile.oneLiner ?? ''}`,
    `Problema principal: ${profile.primaryProblem ?? ''}`,
    `Proposta de valor: ${profile.valueProposition ?? ''}`,
    `Diferenciais: ${profile.data.differentiators.join(', ') || 'nenhum'}`,
  ].join('\n')

  const ideaBlock = [
    `Título da ideia: ${idea.title}`,
    `Resumo: ${idea.summary}`,
    `Ângulo: ${idea.angle}`,
    idea.supportingFacts ? `Fatos de suporte: ${JSON.stringify(idea.supportingFacts)}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  const result = await ai().generateStructured({
    task: 'content.write-post',
    promptVersion: PROMPT_VERSION,
    tier: 'standard',
    schema: postOutputSchema,
    system: SYSTEM,
    prompt: [
      '<perfil_do_produto>',
      profileBlock,
      '</perfil_do_produto>',
      '',
      '<audiencia_alvo>',
      `${segment.name}: ${segment.description}`,
      `Dores: ${segment.painPoints.join(', ')}`,
      '</audiencia_alvo>',
      '',
      '<ideia>',
      ideaBlock,
      '</ideia>',
      '',
      '<capacidades_do_canal>',
      `Canal: ${channel}`,
      `Máximo de grafemas (TOTAL = hook + body + cta juntos, separados por linha em branco): ${caps.maxChars}`,
      `Tom: ${caps.tone}`,
      `Notas: ${caps.notes}`,
      `Suporta links: ${caps.supportsLinks ? 'sim' : 'não'}`,
      '</capacidades_do_canal>',
      '',
      '<memoria_de_posts>',
      memoryBlock,
      '</memoria_de_posts>',
      '',
      rejectionBlock,
      '',
      `Escreva o post para o canal "${channel}". O hook NÃO pode repetir nenhum dos hooks listados na memória.`,
    ]
      .filter(Boolean)
      .join('\n'),
    context: { productId: input.productId },
    verify: (data) => {
      const issues: string[] = []
      // Monta o texto exatamente como o publisher vai fazer (separadores \n\n)
      const parts = [data.hook.trim()]
      if (data.body.trim()) parts.push(data.body.trim())
      if (data.cta && data.cta.trim()) parts.push(data.cta.trim())
      const full = parts.join('\n\n')
      const graphemeCount = (() => {
        try { return [...new Intl.Segmenter().segment(full)].length } catch { return full.length }
      })()

      if (graphemeCount > caps.maxChars) {
        issues.push(
          `Post excede o limite do canal (${graphemeCount} grafemas vs ${caps.maxChars} permitidos). Encurte hook, body e/ou cta.`,
        )
      }
      if (data.hook.trim().length < 10) {
        issues.push('Hook muito curto.')
      }

      // Garante que o hook não é idêntico a nenhum post recente
      const recentHooks = recentPosts.map((p) => p.hook.toLowerCase().trim())
      if (recentHooks.includes(data.hook.toLowerCase().trim())) {
        issues.push('Hook idêntico a um post recente.')
      }

      return issues
    },
  })

  return { post: result.data, callId: result.callId, costUsd: result.costUsd }
}
