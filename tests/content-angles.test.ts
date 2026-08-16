import { describe, it, expect } from 'vitest'
import { selectAnglesForWeek, MAX_ANGLE_PERCENTAGE } from '@/modules/campaigns/ai/generate-ideas'
import { CONTENT_ANGLES } from '@/modules/content/types'

describe('selectAnglesForWeek', () => {
  it('retorna o número exato de ângulos pedido', () => {
    const angles = selectAnglesForWeek({ totalIdeas: 10, recentAngleCounts: {} })
    expect(angles).toHaveLength(10)
  })

  it('nenhum ângulo excede 30% das ideias da semana', () => {
    const totalIdeas = 10
    const angles = selectAnglesForWeek({ totalIdeas, recentAngleCounts: {} })

    const counts: Record<string, number> = {}
    for (const a of angles) {
      counts[a] = (counts[a] ?? 0) + 1
    }

    const maxAllowed = Math.ceil(totalIdeas * MAX_ANGLE_PERCENTAGE)
    for (const [angle, count] of Object.entries(counts)) {
      expect(count).toBeLessThanOrEqual(maxAllowed), `ângulo "${angle}" excedeu o teto`
    }
  })

  it('prefere ângulos menos usados recentemente', () => {
    // Se "problem" foi usado 10 vezes e o resto 0, "problem" deve aparecer pouco
    const recentAngleCounts = { problem: 10 }
    const angles = selectAnglesForWeek({ totalIdeas: 5, recentAngleCounts })

    const problemCount = angles.filter((a) => a === 'problem').length
    // problem pode aparecer no máximo ceil(5 * 0.3) = 2 vezes
    expect(problemCount).toBeLessThanOrEqual(Math.ceil(5 * MAX_ANGLE_PERCENTAGE))
  })

  it('funciona quando totalIdeas é maior que o número de ângulos disponíveis', () => {
    const totalIdeas = CONTENT_ANGLES.length + 5
    const angles = selectAnglesForWeek({ totalIdeas, recentAngleCounts: {} })
    expect(angles).toHaveLength(totalIdeas)
  })

  it('todos os ângulos retornados são valores válidos do enum', () => {
    const angles = selectAnglesForWeek({ totalIdeas: 14, recentAngleCounts: {} })
    const valid = new Set(CONTENT_ANGLES)
    for (const a of angles) {
      expect(valid.has(a)).toBe(true)
    }
  })

  it('com histórico balanceado distribui uniformemente', () => {
    const recentAngleCounts = Object.fromEntries(CONTENT_ANGLES.map((a) => [a, 2]))
    const totalIdeas = 7
    const angles = selectAnglesForWeek({ totalIdeas, recentAngleCounts })

    expect(angles).toHaveLength(totalIdeas)
    // Deve usar 7 ângulos distintos (todos têm count igual)
    const distinct = new Set(angles).size
    expect(distinct).toBeGreaterThanOrEqual(Math.min(7, CONTENT_ANGLES.length))
  })
})
