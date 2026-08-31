import type { GrowthEvent } from '@/modules/attribution/schema'

/**
 * Leitura dos tipos de evento existentes durante `stage = 'validating'`
 * (roadmap fase 4.5, §4). Nenhum enum novo — só a interpretação, centralizada
 * aqui para não virar leitura implícita espalhada pela UI e pelo gate.
 */
export type SignalWeight = 'weak' | 'strong'

export const VALIDATION_SIGNAL_WEIGHTS: Partial<Record<GrowthEvent['eventType'], SignalWeight>> = {
  signup: 'weak',
  activation: 'strong',
  paid: 'strong',
}

export const STRONG_SIGNAL_EVENT_TYPES: GrowthEvent['eventType'][] = (
  Object.entries(VALIDATION_SIGNAL_WEIGHTS) as [GrowthEvent['eventType'], SignalWeight][]
)
  .filter(([, weight]) => weight === 'strong')
  .map(([type]) => type)

export const SIGNAL_LABELS: Record<GrowthEvent['eventType'], string> = {
  impression: 'Impressão',
  click: 'Clique',
  signup: 'Inscrição (waitlist)',
  activation: 'Conversa aceita / pesquisa respondida',
  paid: 'Pré-venda / depósito / carta de intenção',
  churn: 'Churn',
}
