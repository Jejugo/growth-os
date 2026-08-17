import {
  pgTable,
  text,
  timestamp,
  integer,
  pgEnum,
  jsonb,
  numeric,
  index,
  unique,
} from 'drizzle-orm/pg-core'
import { newId } from '@/lib/ids'
import { products } from '@/modules/products/schema'

// --- Tracking Links ---------------------------------------------------------

export const trackingLinks = pgTable(
  'tracking_links',
  {
    id: text('id').primaryKey().$defaultFn(newId),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    campaignId: text('campaign_id'),
    // Sem FK para evitar acoplamento circular com content/distribution
    postId: text('post_id'),
    publicationId: text('publication_id'),
    code: text('code').notNull().unique(),
    destinationUrl: text('destination_url').notNull(),
    generatedUrl: text('generated_url').notNull(),
    utmSource: text('utm_source').notNull(),
    utmMedium: text('utm_medium').notNull(),
    utmCampaign: text('utm_campaign').notNull(),
    utmContent: text('utm_content'),
    ref: text('ref').notNull().unique(),
    clickCount: integer('click_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('tracking_links_product_idx').on(t.productId, t.createdAt.desc())],
)

// --- Visitors ---------------------------------------------------------------

export const visitors = pgTable(
  'visitors',
  {
    id: text('id').primaryKey().$defaultFn(newId),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    visitorId: text('visitor_id').notNull(),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    firstTrackingLinkId: text('first_tracking_link_id'),
    lastTrackingLinkId: text('last_tracking_link_id'),
    externalUserId: text('external_user_id'),
  },
  (t) => [
    unique('visitors_product_visitor_unique').on(t.productId, t.visitorId),
    index('visitors_product_idx').on(t.productId, t.lastSeenAt.desc()),
  ],
)

// --- Growth Events ----------------------------------------------------------

export const growthEventType = pgEnum('growth_event_type', [
  'impression',
  'click',
  'signup',
  'activation',
  'paid',
  'churn',
])

export const attributionModel = pgEnum('attribution_model', [
  'direct',
  'last_touch',
  'first_touch',
  'none',
])

export const growthEvents = pgTable(
  'growth_events',
  {
    id: text('id').primaryKey().$defaultFn(newId),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    visitorId: text('visitor_id'),
    externalUserId: text('external_user_id'),
    eventType: growthEventType('event_type').notNull(),
    campaignId: text('campaign_id'),
    postId: text('post_id'),
    publicationId: text('publication_id'),
    trackingLinkId: text('tracking_link_id'),
    audienceSegmentId: text('audience_segment_id'),
    channel: text('channel'),
    value: numeric('value', { precision: 12, scale: 2 }),
    attributionModel: attributionModel('attribution_model').notNull().default('none'),
    metadata: jsonb('metadata').notNull().default({}),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    dedupeKey: text('dedupe_key').notNull().unique(),
  },
  (t) => [
    index('growth_events_product_type_idx').on(t.productId, t.eventType, t.occurredAt.desc()),
  ],
)

// --- Ingest Keys ------------------------------------------------------------

export const ingestKeys = pgTable('ingest_keys', {
  id: text('id').primaryKey().$defaultFn(newId),
  productId: text('product_id')
    .notNull()
    .references(() => products.id, { onDelete: 'cascade' }),
  keyHash: text('key_hash').notNull(),
  name: text('name').notNull(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// --- Tipos inferidos --------------------------------------------------------

export type TrackingLink = typeof trackingLinks.$inferSelect
export type Visitor = typeof visitors.$inferSelect
export type GrowthEvent = typeof growthEvents.$inferSelect
export type IngestKey = typeof ingestKeys.$inferSelect
