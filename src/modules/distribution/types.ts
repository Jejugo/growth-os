import type { ChannelAccount } from './schema'

// --- Capacidades do canal -----------------------------------------------

export interface ChannelCapabilities {
  maxGraphemes: number
  supportsLinks: boolean
  supportsMedia: boolean
  supportsThreads: boolean
  supportsMarkdown: boolean
}

// --- Conteúdo renderizado -----------------------------------------------

export interface RenderedContent {
  text: string
  linkUrl?: string
  graphemeCount: number
}

// --- Contexto de publicação ---------------------------------------------

export interface PublishContext {
  publicationId: string
  idempotencyKey: string
  account: ChannelAccount
}

// --- Resultado de publicação --------------------------------------------

export type PublicationOutcome = 'success' | 'retryable' | 'permanent' | 'unknown'

export interface PublicationResult {
  outcome: PublicationOutcome
  externalId?: string
  externalUrl?: string
  error?: string
  responseStatus?: number
}

// --- Post externo (para reconciliação) ----------------------------------

export interface ExternalPost {
  externalId: string
  externalUrl: string
  text: string
  publishedAt: Date
}

// --- Resultado de validação ---------------------------------------------

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

// --- Interface de canal -------------------------------------------------

export interface DistributionChannel {
  readonly channel: 'bluesky' | 'linkedin' | 'reddit'
  getCapabilities(): ChannelCapabilities
  validate(content: RenderedContent): ValidationResult
  publish(content: RenderedContent, ctx: PublishContext): Promise<PublicationResult>
  fetchRecent(account: ChannelAccount, since: Date): Promise<ExternalPost[]>
}

// --- Credenciais por canal ----------------------------------------------

export interface BlueskyCredentials {
  identifier: string
  appPassword: string
}

export interface LinkedInCredentials {
  accessToken: string
  accountId: string
}

export interface RedditCredentials {
  accessToken: string
  refreshToken: string
  subreddit: string
}
