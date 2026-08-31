import { ai } from '@/modules/ai'
import { angleVariantsSchema, type AngleVariants } from '../types'
import type { ProductBrief } from '../schema'

export const PROMPT_VERSION = 'validation.derive-angles@1'

const SYSTEM = `Você propõe ângulos de posicionamento concorrentes para testar qual mensagem gera mais demanda por uma ideia de produto ainda não construída.

Regras:
- Gere 2 ou 3 ângulos. Cada um é uma forma DIFERENTE de enquadrar a mesma ideia — não são features diferentes, são histórias diferentes sobre o mesmo problema/solução.
- Ângulos comuns e úteis: por segmento de audiência (ex.: freelancer vs. agência), por dor enfatizada (ex.: tempo perdido vs. dinheiro perdido), por prova (ex.: dado/pesquisa vs. narrativa pessoal).
- "positioningAngle" é a instrução para quem vai escrever o post: específica o bastante para produzir um post concreto sem ambiguidade.
- Não invente números, cases ou provas que o brief não sustenta.
- Os ângulos precisam ser realmente distintos entre si — dois ângulos que dizem a mesma coisa com sinônimos não servem para o teste.`

export async function deriveAngleVariants(input: {
  productId: string
  brief: ProductBrief
}): Promise<{ variants: AngleVariants['variants']; callId: string; costUsd: number }> {
  const { brief } = input

  const briefBlock = [
    `Problema: ${brief.problem}`,
    `Audiência: ${brief.audience}`,
    `Esboço de solução: ${brief.solutionSketch}`,
    brief.whyNow ? `Por que agora: ${brief.whyNow}` : '',
    brief.alternatives ? `Alternativas hoje: ${brief.alternatives}` : '',
    `Hipótese mais arriscada: ${brief.riskiestAssumption}`,
  ]
    .filter(Boolean)
    .join('\n')

  const result = await ai().generateStructured({
    task: 'validation.derive-angles',
    promptVersion: PROMPT_VERSION,
    tier: 'strong',
    schema: angleVariantsSchema,
    system: SYSTEM,
    prompt: `<brief>\n${briefBlock}\n</brief>\n\nProponha os ângulos de posicionamento a testar.`,
    context: { productId: input.productId },
    verify: (data) => {
      const issues: string[] = []
      const names = data.variants.map((v) => v.name.toLowerCase().trim())
      if (new Set(names).size !== names.length) {
        issues.push('Dois ângulos com o mesmo nome — precisam ser distinguíveis na UI.')
      }
      return issues
    },
  })

  return { variants: result.data.variants, callId: result.callId, costUsd: result.costUsd }
}
