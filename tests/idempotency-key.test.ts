import { describe, it, expect } from 'vitest'
import { buildIdempotencyKey } from '@/modules/distribution/publisher'

describe('chave de idempotência', () => {
  it('gera hash sha256 consistente para os mesmos inputs', () => {
    const date = new Date('2026-08-17T10:00:00.000Z')
    const key1 = buildIdempotencyKey('post_1', 'account_1', date)
    const key2 = buildIdempotencyKey('post_1', 'account_1', date)
    expect(key1).toBe(key2)
  })

  it('chaves diferentes para posts diferentes', () => {
    const date = new Date('2026-08-17T10:00:00.000Z')
    const key1 = buildIdempotencyKey('post_1', 'account_1', date)
    const key2 = buildIdempotencyKey('post_2', 'account_1', date)
    expect(key1).not.toBe(key2)
  })

  it('chaves diferentes para contas diferentes', () => {
    const date = new Date('2026-08-17T10:00:00.000Z')
    const key1 = buildIdempotencyKey('post_1', 'account_1', date)
    const key2 = buildIdempotencyKey('post_1', 'account_2', date)
    expect(key1).not.toBe(key2)
  })

  it('chaves diferentes para datas diferentes', () => {
    const key1 = buildIdempotencyKey('post_1', 'account_1', new Date('2026-08-17T10:00:00Z'))
    const key2 = buildIdempotencyKey('post_1', 'account_1', new Date('2026-08-17T11:00:00Z'))
    expect(key1).not.toBe(key2)
  })

  it('retorna string hexadecimal de 64 chars (sha256)', () => {
    const key = buildIdempotencyKey('post_1', 'account_1', new Date())
    expect(key).toMatch(/^[a-f0-9]{64}$/)
  })
})
