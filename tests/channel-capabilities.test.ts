import { describe, it, expect } from 'vitest'
import { CHANNEL_CAPABILITIES } from '@/modules/content/types'

// Garante que as capacidades de canal são determinísticas e nunca fabricadas pelo LLM.
// O write-post.ts injeta estas constantes no prompt — se alguma mudar de forma
// inesperada, os testes aqui capturam antes de chegar em produção.

describe('CHANNEL_CAPABILITIES', () => {
  const channels = ['bluesky', 'linkedin', 'reddit', 'blog', 'newsletter'] as const

  it('todos os 5 canais têm configuração', () => {
    for (const ch of channels) {
      expect(CHANNEL_CAPABILITIES[ch], `canal "${ch}" ausente`).toBeDefined()
    }
  })

  it('cada canal tem maxChars positivo', () => {
    for (const ch of channels) {
      const caps = CHANNEL_CAPABILITIES[ch]!
      expect(caps.maxChars).toBeGreaterThan(0)
    }
  })

  it('bluesky tem limite de 300 chars', () => {
    expect(CHANNEL_CAPABILITIES.bluesky.maxChars).toBe(300)
  })

  it('linkedin tem limite de 3000 chars', () => {
    expect(CHANNEL_CAPABILITIES.linkedin.maxChars).toBe(3000)
  })

  it('reddit não suporta links por padrão', () => {
    expect(CHANNEL_CAPABILITIES.reddit.supportsLinks).toBe(false)
  })

  it('todos os canais têm tom não-vazio', () => {
    for (const ch of channels) {
      const caps = CHANNEL_CAPABILITIES[ch]!
      expect(caps.tone.trim().length).toBeGreaterThan(0)
    }
  })

  it('canais são imutáveis em runtime (nenhuma capacidade é undefined)', () => {
    for (const ch of channels) {
      const caps = CHANNEL_CAPABILITIES[ch]!
      expect(caps.maxChars).toBeDefined()
      expect(caps.tone).toBeDefined()
      expect(caps.notes).toBeDefined()
      expect(typeof caps.supportsLinks).toBe('boolean')
      expect(typeof caps.supportsImages).toBe('boolean')
    }
  })
})
