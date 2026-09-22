import type {
  DistributionChannel,
  ChannelCapabilities,
  RenderedContent,
  ValidationResult,
  PublishContext,
  PublicationResult,
  ExternalPost,
} from '../types'
import type { ChannelAccount } from '../schema'

/**
 * Adapter Reddit — apenas geração de rascunho nesta fase, sem publicação.
 * Conforme seção 12 do plano: "Reddit apenas geração de rascunho, sem publicação."
 */
export class RedditChannel implements DistributionChannel {
  readonly channel = 'reddit' as const
  readonly publishMode = 'api' as const

  getCapabilities(): ChannelCapabilities {
    return {
      maxGraphemes: 10000,
      supportsLinks: true,
      supportsMedia: false,
      supportsThreads: false,
      supportsMarkdown: true,
    }
  }

  validate(content: RenderedContent): ValidationResult {
    const errors: string[] = []
    if (!content.text.trim()) {
      errors.push('Texto do rascunho está vazio.')
    }
    return { valid: errors.length === 0, errors }
  }

  async publish(_content: RenderedContent, _ctx: PublishContext): Promise<PublicationResult> {
    // Publicação desabilitada na Fase 2 — apenas rascunho
    return {
      outcome: 'permanent',
      error: 'Reddit opera apenas em modo rascunho nesta fase. Publicação manual requerida.',
    }
  }

  async fetchRecent(_account: ChannelAccount, _since: Date): Promise<ExternalPost[]> {
    return []
  }
}
