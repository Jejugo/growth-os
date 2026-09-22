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
 * Adapter LinkedIn — opera em modo manual_assist porque a API de posts de
 * organização/membro requer aprovação de produto. O texto final é gerado e
 * a publicação é registrada; o humano copia e cola.
 *
 * Quando a API estiver disponível, este adapter pode ser atualizado para
 * publicar diretamente sem alterar a interface.
 */
const MAX_GRAPHEMES = 3000

export class LinkedInChannel implements DistributionChannel {
  readonly channel = 'linkedin' as const
  readonly publishMode = 'manual' as const
  readonly fallbackUrl = 'https://www.linkedin.com/feed/'

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
      errors.push(`Post tem ${content.graphemeCount} grafemas; máximo do LinkedIn é ${MAX_GRAPHEMES}.`)
    }
    if (!content.text.trim()) {
      errors.push('Texto do post está vazio.')
    }
    return { valid: errors.length === 0, errors }
  }

  /**
   * LinkedIn não possui integração de publicação neste fluxo.
   */
  async publish(_content: RenderedContent, _ctx: PublishContext): Promise<PublicationResult> {
    return {
      outcome: 'permanent',
      error: 'Canal LinkedIn é manual e não publica via API.',
    }
  }

  async fetchRecent(_account: ChannelAccount, _since: Date): Promise<ExternalPost[]> {
    // Sem API disponível — reconciliação manual apenas
    return []
  }
}
