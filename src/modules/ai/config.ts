/**
 * Roteamento de modelo (init.md §22) — a ÚNICA fonte do mapa tier → modelo.
 * Lógica de negócio escolhe o tier; nunca o nome do modelo.
 */

export type ModelTier = 'cheap' | 'standard' | 'strong'

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export interface ModelConfig {
  id: string
  /** USD por milhão de tokens. */
  inputPerMTok: number
  outputPerMTok: number
  /** Nem todo modelo aceita `effort` — Haiku 4.5 retorna 400 se receber. */
  effort?: Effort
  /** Thinking adaptativo. Em Opus 5 já é o default, então omitimos. */
  thinking: 'adaptive' | 'default-on' | 'unsupported'
  maxTokens: number
}

export const MODELS: Record<ModelTier, ModelConfig> = {
  // Classificação, extração de texto, tagging, deduplicação.
  cheap: {
    id: 'claude-haiku-4-5',
    inputPerMTok: 1,
    outputPerMTok: 5,
    thinking: 'unsupported',
    maxTokens: 8_000,
  },
  // Redação, adaptação por canal, resumos.
  standard: {
    id: 'claude-sonnet-5',
    // Preço de tabela. O promocional (US$ 2/10) vale até 2026-08-31, então
    // até lá o custo registrado é uma superestimativa — erro seguro para um
    // guarda de orçamento.
    inputPerMTok: 3,
    outputPerMTok: 15,
    effort: 'medium',
    thinking: 'adaptive',
    maxTokens: 16_000,
  },
  // Estratégia, raciocínio de audiência, decisões de risco.
  strong: {
    id: 'claude-opus-5',
    inputPerMTok: 5,
    outputPerMTok: 25,
    effort: 'high',
    thinking: 'default-on',
    maxTokens: 16_000,
  },
}

export const OPENAI_MODELS: Record<ModelTier, ModelConfig> = {
  cheap: {
    id: 'gpt-4o-mini',
    inputPerMTok: 0.15,
    outputPerMTok: 0.6,
    thinking: 'unsupported',
    maxTokens: 8_000,
  },
  standard: {
    id: 'gpt-4o',
    inputPerMTok: 2.5,
    outputPerMTok: 10,
    thinking: 'unsupported',
    maxTokens: 16_000,
  },
  strong: {
    id: 'gpt-4o',
    inputPerMTok: 2.5,
    outputPerMTok: 10,
    thinking: 'unsupported',
    maxTokens: 16_000,
  },
}

/** Multiplicadores de cache da API (leitura ~0,1x; escrita 1,25x em TTL 5min). */
const CACHE_READ_MULTIPLIER = 0.1
const CACHE_WRITE_MULTIPLIER = 1.25

export function estimateCostUsd(
  tier: ModelTier,
  usage: {
    inputTokens: number
    outputTokens: number
    cacheReadTokens?: number
    cacheWriteTokens?: number
  },
): number {
  const m = MODELS[tier]
  const perInput = m.inputPerMTok / 1_000_000
  const perOutput = m.outputPerMTok / 1_000_000

  return (
    usage.inputTokens * perInput +
    usage.outputTokens * perOutput +
    (usage.cacheReadTokens ?? 0) * perInput * CACHE_READ_MULTIPLIER +
    (usage.cacheWriteTokens ?? 0) * perInput * CACHE_WRITE_MULTIPLIER
  )
}
