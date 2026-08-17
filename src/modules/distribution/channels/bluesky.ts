import { BskyAgent } from '@atproto/api'
import { decryptCredentials } from '../credentials'
import type {
  DistributionChannel,
  ChannelCapabilities,
  RenderedContent,
  ValidationResult,
  PublishContext,
  PublicationResult,
  ExternalPost,
  BlueskyCredentials,
} from '../types'
import type { ChannelAccount } from '../schema'

// Limites oficiais Bluesky: 300 grafemas por post.
// Operamos com margem: se o texto passar de 300, o adapter rejeita na validação.
const MAX_GRAPHEMES = 300

function countGraphemes(text: string): number {
  try {
    const seg = new Intl.Segmenter()
    return [...seg.segment(text)].length
  } catch {
    return text.length
  }
}

export class BlueSkyChannel implements DistributionChannel {
  readonly channel = 'bluesky' as const

  getCapabilities(): ChannelCapabilities {
    return {
      maxGraphemes: MAX_GRAPHEMES,
      supportsLinks: true,
      supportsMedia: false,
      supportsThreads: false,
      supportsMarkdown: false,
    }
  }

  validate(content: RenderedContent): ValidationResult {
    const errors: string[] = []
    if (content.graphemeCount > MAX_GRAPHEMES) {
      errors.push(
        `Post tem ${content.graphemeCount} grafemas; máximo do Bluesky é ${MAX_GRAPHEMES}.`,
      )
    }
    if (!content.text.trim()) {
      errors.push('Texto do post está vazio.')
    }
    return { valid: errors.length === 0, errors }
  }

  async publish(content: RenderedContent, ctx: PublishContext): Promise<PublicationResult> {
    const creds = decryptCredentials<BlueskyCredentials>(ctx.account.credentials)
    const agent = new BskyAgent({ service: 'https://bsky.social' })

    try {
      await agent.login({ identifier: creds.identifier, password: creds.appPassword })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // Erro de credencial é permanente
      return { outcome: 'permanent', error: `Login falhou: ${msg}`, responseStatus: 401 }
    }

    try {
      const record = await agent.post({ text: content.text })
      const uri = record.uri
      // URI do Bluesky: at://did/app.bsky.feed.post/rkey
      const parts = uri.split('/')
      const rkey = parts[parts.length - 1]
      const did = creds.identifier.startsWith('did:') ? creds.identifier : agent.session?.did
      const externalUrl = `https://bsky.app/profile/${did}/post/${rkey}`

      return {
        outcome: 'success',
        externalId: uri,
        externalUrl,
      }
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status
      const msg = err instanceof Error ? err.message : String(err)

      if (status === 429) {
        return { outcome: 'retryable', error: `Rate limit: ${msg}`, responseStatus: 429 }
      }

      if (status && status >= 500) {
        // 5xx é ambíguo — não sabemos se o post foi criado
        return { outcome: 'unknown', error: `Erro de servidor: ${msg}`, responseStatus: status }
      }

      if (status && status >= 400 && status < 500) {
        return { outcome: 'permanent', error: `Erro permanente: ${msg}`, responseStatus: status }
      }

      // Timeout ou erro de rede — desconhecido
      return { outcome: 'unknown', error: msg }
    }
  }

  async fetchRecent(account: ChannelAccount, since: Date): Promise<ExternalPost[]> {
    const creds = decryptCredentials<BlueskyCredentials>(account.credentials)
    const agent = new BskyAgent({ service: 'https://bsky.social' })

    try {
      await agent.login({ identifier: creds.identifier, password: creds.appPassword })
      const feed = await agent.getAuthorFeed({
        actor: creds.identifier,
        limit: 20,
      })

      return feed.data.feed
        .filter((item) => {
          const postedAt = new Date(item.post.indexedAt)
          return postedAt >= since
        })
        .map((item) => {
          const post = item.post
          const record = post.record as { text?: string }
          const parts = post.uri.split('/')
          const rkey = parts[parts.length - 1]

          return {
            externalId: post.uri,
            externalUrl: `https://bsky.app/profile/${post.author.did}/post/${rkey}`,
            text: record.text ?? '',
            publishedAt: new Date(post.indexedAt),
          }
        })
    } catch {
      return []
    }
  }
}
