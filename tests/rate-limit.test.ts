import { describe, it, expect, vi, beforeEach } from 'vitest'
import { isWithinAllowedHours, RateLimitError, DailyLimitError } from '@/modules/distribution/service'
import type { AutomationPolicy } from '@/modules/distribution/schema'

function makePolicy(overrides?: Partial<AutomationPolicy>): AutomationPolicy {
  return {
    id: 'pol_1',
    productId: 'prod_1',
    channel: 'bluesky',
    level: 'approval_required',
    maxPostsPerDay: 2,
    minMinutesBetweenPosts: 120,
    allowedHours: null,
    killSwitch: false,
    updatedAt: new Date(),
    ...overrides,
  }
}

describe('janela de horário', () => {
  it('sem allowedHours: sempre permitido', () => {
    const policy = makePolicy({ allowedHours: null })
    expect(isWithinAllowedHours(policy)).toBe(true)
  })

  it('dentro da janela permitida', () => {
    // Seg 10h UTC
    const policy = makePolicy({
      allowedHours: { mon: [[9, 18]] },
    })
    const mon10 = new Date('2026-08-17T10:00:00Z') // segunda-feira
    expect(isWithinAllowedHours(policy, mon10)).toBe(true)
  })

  it('fora da janela permitida', () => {
    const policy = makePolicy({
      allowedHours: { mon: [[9, 12]] },
    })
    const mon14 = new Date('2026-08-17T14:00:00Z')
    expect(isWithinAllowedHours(policy, mon14)).toBe(false)
  })

  it('dia sem janela configurada: não permitido', () => {
    const policy = makePolicy({
      allowedHours: { mon: [[9, 18]] }, // só segunda
    })
    const tue = new Date('2026-08-18T10:00:00Z') // terça
    expect(isWithinAllowedHours(policy, tue)).toBe(false)
  })

  it('múltiplas janelas no mesmo dia', () => {
    const policy = makePolicy({
      allowedHours: { mon: [[9, 12], [14, 18]] },
    })
    const mon11 = new Date('2026-08-17T11:00:00Z')
    const mon13 = new Date('2026-08-17T13:00:00Z')
    const mon15 = new Date('2026-08-17T15:00:00Z')

    expect(isWithinAllowedHours(policy, mon11)).toBe(true)
    expect(isWithinAllowedHours(policy, mon13)).toBe(false)
    expect(isWithinAllowedHours(policy, mon15)).toBe(true)
  })
})

describe('erros de rate limit', () => {
  it('RateLimitError é instância de Error', () => {
    const until = new Date(Date.now() + 15 * 60 * 1000)
    const err = new RateLimitError(until)
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('RateLimitError')
    expect(err.backoffUntil).toEqual(until)
  })

  it('DailyLimitError contém o limite máximo', () => {
    const err = new DailyLimitError(5)
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('DailyLimitError')
    expect(err.max).toBe(5)
    expect(err.message).toContain('5')
  })
})
