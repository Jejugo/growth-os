import { describe, it, expect } from 'vitest'
import { BlueSkyChannel } from '@/modules/distribution/channels/bluesky'

const channel = new BlueSkyChannel()

describe('adapter Bluesky', () => {
  it('getCapabilities retorna limite de 300 grafemas', () => {
    const caps = channel.getCapabilities()
    expect(caps.maxGraphemes).toBe(300)
    expect(caps.supportsLinks).toBe(true)
  })

  it('valida post dentro do limite', () => {
    const content = {
      text: 'Post curto dentro do limite.',
      graphemeCount: 30,
    }
    const result = channel.validate(content)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('rejeita post com 400 grafemas', () => {
    const longText = 'a'.repeat(400)
    const content = {
      text: longText,
      graphemeCount: 400,
    }
    const result = channel.validate(content)
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors[0]).toContain('400')
    expect(result.errors[0]).toContain('300')
  })

  it('rejeita post vazio', () => {
    const content = { text: '   ', graphemeCount: 0 }
    const result = channel.validate(content)
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain('vazio')
  })

  it('canal registrado como bluesky', () => {
    expect(channel.channel).toBe('bluesky')
  })
})
