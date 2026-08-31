import { ai } from '@/modules/ai'
import { briefPositioningSchema, type BriefPositioning } from '../types'
import type { ProductBrief } from '../schema'

export const PROMPT_VERSION = 'validation.positioning-from-brief@1'

/**
 * Equivalente ao passo 2 da análise de produto (fase 0), mas alimentado pelo
 * brief em vez de fatos extraídos de crawl — não há passo 1 aqui porque não
 * há site para ler ainda.
 */
const SYSTEM = `Você é analista de posicionamento de produtos SaaS. A partir de um brief de ideia escrito por um fundador, infere o posicionamento comercial que essa ideia teria se existisse.

O que você produz alimenta um teste de demanda real, então precisa ser específico o bastante para alguém escrever um post a partir dele.

Regras:
- Trabalhe apenas com o que o brief diz. Não invente fatos, preços ou funcionalidades que o brief não menciona.
- "Problema principal" é a dor de quem compra, na linguagem dessa pessoa.
- "Usuários-alvo" são cargos, senioridades e contextos concretos, nunca rótulos genéricos como "empresas".
- "Diferenciais" só valem se sustentados pelo brief (a hipótese mais arriscada e o esboço de solução). Sem sustentação, lista vazia.
- pricingSummary: null a menos que o brief mencione preço explicitamente — uma ideia não validada não tem preço real ainda.
- "Objeções" são os motivos reais pelos quais alguém no perfil-alvo não experimentaria.`

export async function inferPositioningFromBrief(input: {
  productId: string
  brief: ProductBrief
}): Promise<{ positioning: BriefPositioning; callId: string; costUsd: number }> {
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
    task: 'validation.positioning-from-brief',
    promptVersion: PROMPT_VERSION,
    tier: 'strong',
    schema: briefPositioningSchema,
    system: SYSTEM,
    prompt: `<brief>\n${briefBlock}\n</brief>\n\nInfira o posicionamento comercial desta ideia.`,
    context: { productId: input.productId },
    verify: (data) => {
      const issues: string[] = []
      if (data.primaryProblem.trim().length < 20) {
        issues.push('primaryProblem está curto demais para ser acionável.')
      }
      if (data.targetUsers.length === 0) {
        issues.push('targetUsers não pode ser vazio — descreva ao menos um perfil concreto.')
      }
      return issues
    },
  })

  return { positioning: result.data, callId: result.callId, costUsd: result.costUsd }
}
