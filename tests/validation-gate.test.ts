import { describe, it, expect } from 'vitest'
import { evaluateGate, type GateThresholds } from '@/modules/validation/gate'

const THRESHOLDS: GateThresholds = {
  minVisitors: 300,
  minSignups: 100,
  minSignupRate: 0.04,
  minStrongSignals: 5,
}

describe('gate de validação', () => {
  it('regra 1: tráfego abaixo do mínimo é sempre inconclusive, nunca kill', () => {
    const result = evaluateGate(
      { visitors: 299, signups: 0, strongSignals: 0 },
      THRESHOLDS,
    )
    expect(result.verdict).toBe('inconclusive')
    expect(result.rule).toBe('insufficient_traffic')
  })

  it('regra 1: zero visitantes não quebra (divisão por zero) e é inconclusive', () => {
    const result = evaluateGate({ visitors: 0, signups: 0, strongSignals: 0 }, THRESHOLDS)
    expect(result.verdict).toBe('inconclusive')
    expect(result.signupRate).toBe(0)
  })

  it('fronteira exata: visitantes == minVisitors não é mais insuficiente', () => {
    // 300 visitantes, taxa exatamente no limiar, mas inscritos/fortes abaixo → cai noutra regra, não na 1.
    const result = evaluateGate({ visitors: 300, signups: 5, strongSignals: 0 }, THRESHOLDS)
    expect(result.rule).not.toBe('insufficient_traffic')
  })

  it('regra 2: demanda confirmada quando os três limiares são atingidos', () => {
    const result = evaluateGate(
      { visitors: 1000, signups: 100, strongSignals: 5 },
      THRESHOLDS,
    )
    expect(result.verdict).toBe('build')
    expect(result.rule).toBe('demand_confirmed')
  })

  it('fronteira exata regra 2: exatamente nos três limiares ainda é build', () => {
    // taxa = 100/2500 = 0.04 exatamente
    const result = evaluateGate({ visitors: 2500, signups: 100, strongSignals: 5 }, THRESHOLDS)
    expect(result.verdict).toBe('build')
  })

  it('regra 2 falha por 1 sinal forte a menos → não é build', () => {
    const result = evaluateGate({ visitors: 1000, signups: 100, strongSignals: 4 }, THRESHOLDS)
    expect(result.verdict).not.toBe('build')
  })

  it('regra 3: taxa alta mas zero sinais fortes é pivot (interesse sem intenção)', () => {
    const result = evaluateGate({ visitors: 1000, signups: 200, strongSignals: 0 }, THRESHOLDS)
    expect(result.verdict).toBe('pivot')
    expect(result.rule).toBe('interest_without_intent')
  })

  it('regra 4: taxa baixa mas com sinal forte é pivot (nicho existe, mensagem erra)', () => {
    const result = evaluateGate({ visitors: 1000, signups: 10, strongSignals: 2 }, THRESHOLDS)
    expect(result.verdict).toBe('pivot')
    expect(result.rule).toBe('niche_wrong_message')
  })

  it('regra 5: sem taxa e sem sinal é kill', () => {
    const result = evaluateGate({ visitors: 1000, signups: 5, strongSignals: 0 }, THRESHOLDS)
    expect(result.verdict).toBe('kill')
    expect(result.rule).toBe('no_demand')
  })

  it('inscrições nunca aprovam sozinhas: minStrongSignals > 0 é obrigatório para build', () => {
    // Muito acima de minSignups e minSignupRate, mas zero sinais fortes.
    const result = evaluateGate({ visitors: 1000, signups: 500, strongSignals: 0 }, THRESHOLDS)
    expect(result.verdict).not.toBe('build')
  })

  it('taxa alta com sinais fortes insuficientes (mas > 0) cai fora das regras 2-4 → kill', () => {
    // Não é regra 2 (fortes < mínimo), não é regra 3 (fortes != 0), não é
    // regra 4 (taxa não é < minSignupRate). O que sobra é a regra 5.
    const result = evaluateGate({ visitors: 1000, signups: 200, strongSignals: 2 }, THRESHOLDS)
    expect(result.rule).toBe('no_demand')
    expect(result.verdict).toBe('kill')
  })

  it('signupRate é sempre reportado, mesmo quando o veredito não depende dele diretamente', () => {
    const result = evaluateGate({ visitors: 500, signups: 50, strongSignals: 10 }, THRESHOLDS)
    expect(result.signupRate).toBeCloseTo(0.1)
  })
})
