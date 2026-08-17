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

function countGraphemes(text: string): number {
  try {
    const seg = new Intl.Segmenter()
    return [...seg.segment(text)].length
  } catch {
    return text.length
  }
}

export class LinkedInChannel implements DistributionChannel {
  readonly channel = 'linkedin' as const

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
   * Não faz chamada de rede. Retorna 'success' com um externalId especial
   * que indica que o humano precisa confirmar a publicação manualmente.
   *
   * O status da publicação vai para 'unknown' até confirmação.
   */
  async publish(content: RenderedContent, ctx: PublishContext): Promise<PublicationResult> {
    // Registra como manual — o humano cola o texto no LinkedIn
    return {
      outcome: 'unknown',
      externalId: `manual_assist:${ctx.publicationId}`,
      error: 'LinkedIn opera em modo manual_assist. Cole o texto gerado na plataforma.',
    }
  }

  async fetchRecent(_account: ChannelAccount, _since: Date): Promise<ExternalPost[]> {
    // Sem API disponível — reconciliação manual apenas
    return []
  }
}
