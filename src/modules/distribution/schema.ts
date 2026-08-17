import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  pgEnum,
  index,
  unique,
} from 'drizzle-orm/pg-core'
import { newId } from '@/lib/ids'
import { products } from '@/modules/products/schema'
import { socialPosts } from '@/modules/content/schema'

// --- Canais suportados --------------------------------------------------

export const distributionChannel = pgEnum('distribution_channel', [
  'bluesky',
  'linkedin',
  'reddit',
])

// --- Configuração global (singleton) ------------------------------------

export const systemConfig = pgTable('system_config', {
  id: text('id').primaryKey().default('singleton'),
  globalKillSwitch: boolean('global_kill_switch').notNull().default(false),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// --- Contas de canal ----------------------------------------------------

export const channelAccountStatus = pgEnum('channel_account_status', [
  'active',
  'paused',
  'error',
  'revoked',
])

export const channelAccounts = pgTable(
  'channel_accounts',
  {
    id: text('id').primaryKey().$defaultFn(newId),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    channel: distributionChannel('channel').notNull(),
    handle: text('handle').notNull(),
    displayName: text('display_name'),
    // AES-256-GCM cifrado, base64; nunca em log
    credentials: text('credentials').notNull(),
    credentialsExpiresAt: timestamp('credentials_expires_at', { withTimezone: true }),
    status: channelAccountStatus('status').notNull().default('active'),
    lastErrorAt: timestamp('last_error_at', { withTimezone: true }),
    lastErrorMessage: text('last_error_message'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('channel_account_unique').on(t.productId, t.channel, t.handle)],
)

// --- Políticas de automação ---------------------------------------------

export const automationLevel = pgEnum('automation_level', [
  'automatic',
  'approval_required',
  'suggestions_only',
])

export const automationPolicies = pgTable(
  'automation_policies',
  {
    id: text('id').primaryKey().$defaultFn(newId),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    channel: distributionChannel('channel').notNull(),
    level: automationLevel('level').notNull().default('approval_required'),
    maxPostsPerDay: integer('max_posts_per_day').notNull().default(2),
    minMinutesBetweenPosts: integer('min_minutes_between_posts').notNull().default(120),
    // {"mon":[[9,12],[14,18]],"tue":...} — janelas por dia em UTC
    allowedHours: jsonb('allowed_hours'),
    killSwitch: boolean('kill_switch').notNull().default(false),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('automation_policy_unique').on(t.productId, t.channel)],
)

// --- Publicações --------------------------------------------------------

export const publicationStatus = pgEnum('publication_status', [
  'scheduled',
  'publishing',
  'published',
  'failed',
  'unknown',
  'cancelled',
])

export const publications = pgTable(
  'publications',
  {
    id: text('id').primaryKey().$defaultFn(newId),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    postId: text('post_id')
      .notNull()
      .references(() => socialPosts.id, { onDelete: 'cascade' }),
    channelAccountId: text('channel_account_id')
      .notNull()
      .references(() => channelAccounts.id, { onDelete: 'cascade' }),
    // sha256(postId + channelAccountId + scheduledFor.toISOString())
    idempotencyKey: text('idempotency_key').notNull().unique(),
    status: publicationStatus('status').notNull().default('scheduled'),
    scheduledFor: timestamp('scheduled_for', { withTimezone: true }).notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    externalId: text('external_id'),
    externalUrl: text('external_url'),
    attemptCount: integer('attempt_count').notNull().default(0),
    lastError: jsonb('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('publications_product_status_idx').on(t.productId, t.status, t.scheduledFor)],
)

// --- Tentativas de publicação -------------------------------------------

export const attemptOutcome = pgEnum('attempt_outcome', [
  'success',
  'retryable_error',
  'permanent_error',
  'unknown',
])

export const publicationAttempts = pgTable('publication_attempts', {
  id: text('id').primaryKey().$defaultFn(newId),
  publicationId: text('publication_id')
    .notNull()
    .references(() => publications.id, { onDelete: 'cascade' }),
  attemptNo: integer('attempt_no').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  // Sanitizado — sem credenciais
  request: jsonb('request').notNull(),
  responseStatus: integer('response_status'),
  response: jsonb('response'),
  outcome: attemptOutcome('outcome'),
})

// --- Estado de rate limit -----------------------------------------------

export const rateLimitState = pgTable('rate_limit_state', {
  channelAccountId: text('channel_account_id')
    .primaryKey()
    .references(() => channelAccounts.id, { onDelete: 'cascade' }),
  windowStartsAt: timestamp('window_starts_at', { withTimezone: true }).notNull(),
  requestCount: integer('request_count').notNull().default(0),
  backoffUntil: timestamp('backoff_until', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// --- Tipos inferidos ---------------------------------------------------

export type SystemConfig = typeof systemConfig.$inferSelect
export type ChannelAccount = typeof channelAccounts.$inferSelect
export type AutomationPolicy = typeof automationPolicies.$inferSelect
export type Publication = typeof publications.$inferSelect
export type PublicationAttempt = typeof publicationAttempts.$inferSelect
export type RateLimitState = typeof rateLimitState.$inferSelect
