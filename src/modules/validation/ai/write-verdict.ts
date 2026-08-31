import { ai } from '@/modules/ai'
import { verdictWriteupSchema, type VerdictWriteup } from '../types'
import type { GateResult, GateThresholds, GateMetrics } from '../gate'
import type { ProductBrief } from '../schema'

export const PROMPT_VERSION = 'validation.write-verdict@1'

/**
 * O LLM só redige — o veredito já foi decidido pelo gate determinístico
 * (`evaluateGate`). Este texto explica os números para um humano, e propõe
 * pivôs concretos quando o veredito é `pivot`. Nunca recalcula nem sugere
 * outro veredito.
 */
const SYSTEM = `Você explica o resultado de um teste de demanda para o fundador de uma ideia de produto.

O veredito JÁ FOI DECIDIDO por uma regra determinística — você não o escolhe, não o questiona e não sugere um veredito diferente. Sua tarefa é: (1) explicar os números que levaram a esse veredito, em linguagem direta; (2) quando o veredito for "pivot", propor 2-3 pivôs concretos e específicos, ancorados no brief e nos ângulos testados — nunca genéricos como "melhore a mensagem".

Regras:
- Não invente causas que os números não sustentam.
- Seja honesto mesmo quando o resultado é desapontador. Otimismo forçado atrapalha uma decisão de matar/pivotar/construir.
- pivotSuggestions: lista vazia quando o veredito não for "pivot".`

export async function writeVerdict(input: {
  productId: string
  brief: ProductBrief
  result: GateResult
  metrics: GateMetrics
  thresholds: GateThresholds
  angleNames: string[]
}): Promise<{ writeup: VerdictWriteup; callId: string; costUsd: number }> {
  const { brief, result, metrics, thresholds, angleNames } = input

  const numbersBlock = [
    `Veredito calculado: ${result.verdict} (regra: ${result.rule})`,
    `Visitantes: ${metrics.visitors} (mínimo: ${thresholds.minVisitors})`,
    `Inscrições: ${metrics.signups} (mínimo: ${thresholds.minSignups})`,
    `Taxa de inscrição: ${(result.signupRate * 100).toFixed(2)}% (mínimo: ${(thresholds.minSignupRate * 100).toFixed(2)}%)`,
    `Sinais fortes (conversa aceita + pré-venda): ${metrics.strongSignals} (mínimo: ${thresholds.minStrongSignals})`,
    angleNames.length > 0 ? `Ângulos testados: ${angleNames.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  const briefBlock = [
    `Problema: ${brief.problem}`,
    `Audiência: ${brief.audience}`,
    `Hipótese testada: ${brief.riskiestAssumption}`,
  ].join('\n')

  const result_ = await ai().generateStructured({
    task: 'validation.write-verdict',
    promptVersion: PROMPT_VERSION,
    tier: 'strong',
    schema: verdictWriteupSchema,
    system: SYSTEM,
    prompt: [
      '<brief>',
      briefBlock,
      '</brief>',
      '',
      '<numeros>',
      numbersBlock,
      '</numeros>',
      '',
      `Explique o veredito "${result.verdict}".`,
    ].join('\n'),
    context: { productId: input.productId },
  })

  return { writeup: result_.data, callId: result_.callId, costUsd: result_.costUsd }
}
