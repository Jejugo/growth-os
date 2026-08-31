/**
 * Gate de decisão da validação (roadmap fase 4.5, §Backend). Puro e
 * determinístico — nenhuma chamada de IA aqui. O LLM só redige a justificativa
 * a partir do resultado já calculado (ver `ai/write-verdict.ts`).
 *
 * Ordem das regras importa e é testada exaustivamente (tests/validation-gate.test.ts):
 *
 * 1. visitantes < minVisitors             → INCONCLUSIVE  ("o teste falhou, não a ideia")
 * 2. inscritos >= minSignups
 *    E taxa    >= minSignupRate
 *    E fortes  >= minStrongSignals        → BUILD
 * 3. taxa >= minSignupRate E fortes == 0  → PIVOT   (interesse sem intenção)
 * 4. taxa < minSignupRate E fortes > 0    → PIVOT   (nicho existe, mensagem erra)
 * 5. caso contrário                       → KILL
 */

export type ValidationVerdict = 'build' | 'pivot' | 'kill' | 'inconclusive'

export type GateRule =
  | 'insufficient_traffic'
  | 'demand_confirmed'
  | 'interest_without_intent'
  | 'niche_wrong_message'
  | 'no_demand'

export interface GateThresholds {
  minVisitors: number
  minSignups: number
  minSignupRate: number
  minStrongSignals: number
}

export interface GateMetrics {
  /** distinct visitorId em growth_events, no produto e na janela */
  visitors: number
  /** count(signup) */
  signups: number
  /** count(activation) + count(paid) */
  strongSignals: number
}

export interface GateResult {
  verdict: ValidationVerdict
  rule: GateRule
  signupRate: number
}

export function evaluateGate(metrics: GateMetrics, thresholds: GateThresholds): GateResult {
  const { visitors, signups, strongSignals } = metrics
  const { minVisitors, minSignups, minSignupRate, minStrongSignals } = thresholds
  const signupRate = visitors > 0 ? signups / visitors : 0

  // Regra 1, inegociável: tráfego insuficiente nunca produz um "não".
  if (visitors < minVisitors) {
    return { verdict: 'inconclusive', rule: 'insufficient_traffic', signupRate }
  }

  if (signups >= minSignups && signupRate >= minSignupRate && strongSignals >= minStrongSignals) {
    return { verdict: 'build', rule: 'demand_confirmed', signupRate }
  }

  if (signupRate >= minSignupRate && strongSignals === 0) {
    return { verdict: 'pivot', rule: 'interest_without_intent', signupRate }
  }

  if (signupRate < minSignupRate && strongSignals > 0) {
    return { verdict: 'pivot', rule: 'niche_wrong_message', signupRate }
  }

  return { verdict: 'kill', rule: 'no_demand', signupRate }
}
