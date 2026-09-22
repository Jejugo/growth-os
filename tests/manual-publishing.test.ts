import { describe, expect, it } from 'vitest'
import { LinkedInChannel } from '@/modules/distribution/channels/linkedin'
import { BlueSkyChannel } from '@/modules/distribution/channels/bluesky'
import { getChannel, isManualChannel } from '@/modules/distribution/channels/registry'
import { validateHttpUrl } from '@/modules/distribution/manual'

describe('modo de publicação por canal', () => {
  it('LinkedIn é manual e tem fallback de feed', async () => {
    const channel = new LinkedInChannel()
    expect(channel.publishMode).toBe('manual')
    expect(channel.fallbackUrl).toBe('https://www.linkedin.com/feed/')

    const result = await channel.publish(
      { text: 'texto', graphemeCount: 5 },
      { publicationId: 'pub_1', idempotencyKey: 'key', account: {} as never },
    )
    expect(result.outcome).toBe('permanent')
  })

  it('Bluesky continua em modo API', () => {
    expect(new BlueSkyChannel().publishMode).toBe('api')
    expect(isManualChannel('linkedin')).toBe(true)
    expect(isManualChannel('bluesky')).toBe(false)
    expect(getChannel('reddit').publishMode).toBe('api')
  })

  it('valida URLs http(s) e rejeita esquemas inválidos', () => {
    expect(validateHttpUrl('https://www.linkedin.com/posts/abc', 'URL')).toBeUndefined()
    expect(validateHttpUrl('http://example.com/post', 'URL')).toBeUndefined()
    expect(validateHttpUrl('javascript:alert(1)', 'URL')).toContain('http(s)')
    expect(validateHttpUrl('not-a-url', 'URL')).toContain('http(s)')
  })
})
