import type { PerformanceRollup } from './schema'

/**
 * Confiança determinística: função de tamanho de amostra, tamanho de efeito
 * e consistência entre janelas. O LLM recebe o número; nunca o produz.
 *
 * Retorna um valor entre 0.00 e 1.00.
 */
export function computeConfidence(
  rollup: Pick<PerformanceRollup, 'posts' | 'clicks' | 'signups' | 'sampleSufficient' | 'signupRate'>,
  baselineSignupRate: number | null,
): number {
  if (!rollup.sampleSufficient) return 0

  // Fator 1: tamanho da amostra (satura em ~500 signups)
  const signupScale = Math.min(1, rollup.signups / 500)
  const clickScale = Math.min(1, rollup.clicks / 1000)
  const sampleFactor = (signupScale * 0.7 + clickScale * 0.3)

  // Fator 2: tamanho do efeito em relação à baseline
  let effectFactor = 0.5
  if (baselineSignupRate !== null && baselineSignupRate > 0) {
    const rate = Number(rollup.signupRate)
    const ratio = rate / baselineSignupRate
    // Efeito de 2x → fator 0.8; 3x → fator ~0.95; <1x → penaliza
    effectFactor = Math.min(1, Math.max(0, 1 - 1 / (ratio * 2)))
  }

  const raw = sampleFactor * 0.6 + effectFactor * 0.4
  return Math.round(Math.min(1, Math.max(0, raw)) * 100) / 100
}

/** Limiares de suficiência de amostra (configuráveis). */
export const SAMPLE_THRESHOLDS = {
  minPosts: 5,
  minClicks: 100,
  minSignups: 10,
} as const

export function isSampleSufficient(
  rollup: Pick<PerformanceRollup, 'posts' | 'clicks' | 'signups' | 'windowKind'>,
): boolean {
  if (rollup.posts < SAMPLE_THRESHOLDS.minPosts) return false
  if (rollup.clicks < SAMPLE_THRESHOLDS.minClicks) return false
  // Para janela all-time, dispensa limiar de signups
  if (rollup.windowKind === 'all') return true
  return rollup.signups >= SAMPLE_THRESHOLDS.minSignups
}
