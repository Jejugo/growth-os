import { describe, it, expect } from 'vitest'
import { applyUtm, extractUtmParams } from '@/modules/distribution/utm'

describe('geração de UTM', () => {
  it('aplica os 4 parâmetros UTM corretamente', () => {
    const url = applyUtm('https://produto.com/landing', {
      channel: 'bluesky',
      campaignId: 'cmp_abc123',
      postId: 'post_xyz789abcdef',
    })

    const params = extractUtmParams(url)
    expect(params.utm_source).toBe('bluesky')
    expect(params.utm_medium).toBe('social')
    expect(params.utm_campaign).toBe('cmp_abc123')
    expect(params.utm_content).toBeTruthy()
    expect(params.utm_content!.length).toBeLessThanOrEqual(16)
  })

  it('preserva parâmetros existentes na URL', () => {
    const url = applyUtm('https://produto.com/page?ref=docs', {
      channel: 'linkedin',
      campaignId: 'cmp_123',
      postId: 'post_456',
    })

    const parsed = new URL(url)
    expect(parsed.searchParams.get('ref')).toBe('docs')
    expect(parsed.searchParams.get('utm_source')).toBe('linkedin')
  })

  it('retorna URL original se inválida', () => {
    const url = applyUtm('nao-e-uma-url', {
      channel: 'bluesky',
      campaignId: 'cmp_1',
      postId: 'post_1',
    })
    expect(url).toBe('nao-e-uma-url')
  })

  it('utm_content é truncado a no máximo 16 chars', () => {
    const url = applyUtm('https://exemplo.com', {
      channel: 'bluesky',
      campaignId: 'cmp_1',
      postId: 'post_umidentificadormuitorande12345',
    })
    const params = extractUtmParams(url)
    expect(params.utm_content!.length).toBeLessThanOrEqual(16)
  })

  it('todos os 4 parâmetros são preenchidos', () => {
    const channels = ['bluesky', 'linkedin', 'reddit']
    for (const channel of channels) {
      const url = applyUtm('https://exemplo.com', {
        channel,
        campaignId: 'cmp_test',
        postId: 'post_test',
      })
      const params = extractUtmParams(url)
      expect(params.utm_source).toBeTruthy()
      expect(params.utm_medium).toBeTruthy()
      expect(params.utm_campaign).toBeTruthy()
      expect(params.utm_content).toBeTruthy()
    }
  })
})
