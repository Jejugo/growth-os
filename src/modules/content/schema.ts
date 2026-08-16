import { pgTable, text, timestamp, pgEnum, index, jsonb, boolean } from 'drizzle-orm/pg-core'
import { newId } from '@/lib/ids'
import { products } from '@/modules/products/schema'
import { campaigns, contentThemes } from '@/modules/campaigns/schema'
import { audienceSegments } from '@/modules/audiences/schema'
import type { RiskReview } from './types'

// --- Ângulo de conteúdo -------------------------------------------------

export const contentAngle = pgEnum('content_angle', [
  'problem',
  'solution',
  'how_to',
  'case_study',
  'comparison',
  'data_research',
  'myth_busting',
  'opinion',
  'trend',
  'story',
  'quick_tip',
  'deep_dive',
  'contrarian',
  'authority',
])

// --- Ideia de conteúdo --------------------------------------------------

export const ideaStatus = pgEnum('idea_status', ['proposed', 'approved', 'rejected', 'used'])

export const contentIdeas = pgTable(
  'content_ideas',
  {
    id: text('id').primaryKey().$defaultFn(newId),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    campaignId: text('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    themeId: text('theme_id')
      .notNull()
      .references(() => contentThemes.id, { onDelete: 'cascade' }),
    audienceSegmentId: text('audience_segment_id').references(() => audienceSegments.id, {
      onDelete: 'set null',
    }),
    title: text('title').notNull(),
    summary: text('summary').notNull(),
    angle: contentAngle('angle').notNull(),
    supportingFacts: jsonb('supporting_facts'),
    status: ideaStatus('status').notNull().default('proposed'),
    rejectionReason: text('rejection_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('content_ideas_product_idx').on(t.productId, t.createdAt.desc())],
)

// --- Peça-mãe (asset) ---------------------------------------------------

export const assetType = pgEnum('asset_type', [
  'article',
  'research',
  'dataset',
  'chart',
  'carousel',
  'newsletter',
  'none',
])

export const contentAssets = pgTable(
  'content_assets',
  {
    id: text('id').primaryKey().$defaultFn(newId),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    ideaId: text('idea_id')
      .notNull()
      .references(() => contentIdeas.id, { onDelete: 'cascade' }),
    type: assetType('type').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    status: ideaStatus('status').notNull().default('proposed'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('content_assets_product_idx').on(t.productId, t.createdAt.desc())],
)

// --- Post de rede social ------------------------------------------------

export const socialChannel = pgEnum('social_channel', [
  'bluesky',
  'linkedin',
  'reddit',
  'blog',
  'newsletter',
])

export const ctaType = pgEnum('cta_type', ['none', 'soft', 'direct'])

export const postStatus = pgEnum('post_status', [
  'draft',
  'pending_approval',
  'approved',
  'rejected',
  'scheduled',
  'published',
  'cancelled',
])

export const socialPosts = pgTable(
  'social_posts',
  {
    id: text('id').primaryKey().$defaultFn(newId),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    ideaId: text('idea_id')
      .notNull()
      .references(() => contentIdeas.id, { onDelete: 'cascade' }),
    assetId: text('asset_id').references(() => contentAssets.id, { onDelete: 'set null' }),
    campaignId: text('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    channel: socialChannel('channel').notNull(),
    // FK para si mesmo — experimento de variante; referência formal vem na fase 4
    variantOf: text('variant_of'),
    hook: text('hook').notNull(),
    body: text('body').notNull(),
    cta: text('cta'),
    ctaType: ctaType('cta_type').notNull().default('none'),
    linkUrl: text('link_url'),
    mediaPlan: jsonb('media_plan'),
    status: postStatus('status').notNull().default('draft'),
    rejectionReason: text('rejection_reason'),
    riskReview: jsonb('risk_review').$type<RiskReview>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('social_posts_product_idx').on(t.productId, t.createdAt.desc())],
)

// --- Fingerprints (dedupe) -----------------------------------------------

export const fingerprintKind = pgEnum('fingerprint_kind', ['idea', 'hook', 'argument', 'cta'])

export const contentFingerprints = pgTable(
  'content_fingerprints',
  {
    id: text('id').primaryKey().$defaultFn(newId),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    postId: text('post_id').references(() => socialPosts.id, { onDelete: 'cascade' }),
    ideaId: text('idea_id').references(() => contentIdeas.id, { onDelete: 'cascade' }),
    kind: fingerprintKind('kind').notNull(),
    normalizedText: text('normalized_text').notNull(),
    hash: text('hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('content_fingerprints_product_idx').on(t.productId, t.createdAt.desc()),
    index('content_fingerprints_hash_idx').on(t.hash),
  ],
)

// --- Feedback humano ----------------------------------------------------

export const feedbackAction = pgEnum('feedback_action', ['approved', 'rejected', 'edited'])

export const contentFeedback = pgTable(
  'content_feedback',
  {
    id: text('id').primaryKey().$defaultFn(newId),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    postId: text('post_id').references(() => socialPosts.id, { onDelete: 'cascade' }),
    ideaId: text('idea_id').references(() => contentIdeas.id, { onDelete: 'cascade' }),
    action: feedbackAction('action').notNull(),
    reason: text('reason'),
    editedFrom: text('edited_from'),
    editedTo: text('edited_to'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('content_feedback_product_idx').on(t.productId, t.createdAt.desc())],
)

// --- Experimentos (tabelas vazias — motor na fase 4) --------------------

export const experiments = pgTable(
  'experiments',
  {
    id: text('id').primaryKey().$defaultFn(newId),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    status: text('status').notNull().default('draft'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('experiments_product_idx').on(t.productId, t.createdAt.desc())],
)

export const experimentVariants = pgTable('experiment_variants', {
  id: text('id').primaryKey().$defaultFn(newId),
  experimentId: text('experiment_id')
    .notNull()
    .references(() => experiments.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  isControl: boolean('is_control').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// --- Tipos inferidos ---------------------------------------------------

export type ContentIdea = typeof contentIdeas.$inferSelect
export type ContentAsset = typeof contentAssets.$inferSelect
export type SocialPost = typeof socialPosts.$inferSelect
export type ContentFingerprint = typeof contentFingerprints.$inferSelect
export type ContentFeedback = typeof contentFeedback.$inferSelect
