import { pgTable, text, timestamp, pgEnum, index } from 'drizzle-orm/pg-core'
import { newId } from '@/lib/ids'
import { products } from '@/modules/products/schema'
import { missions } from '@/modules/missions/schema'

export const campaignStatus = pgEnum('campaign_status', [
  'draft',
  'active',
  'paused',
  'completed',
])

export const campaigns = pgTable(
  'campaigns',
  {
    id: text('id').primaryKey().$defaultFn(newId),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    missionId: text('mission_id').references(() => missions.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    bigIdea: text('big_idea').notNull(),
    // "Se X para Y, então Z porque W" — sem hipótese não há o que avaliar na fase 4
    hypothesis: text('hypothesis').notNull(),
    audienceSegmentIds: text('audience_segment_ids').array().notNull().default([]),
    status: campaignStatus('status').notNull().default('draft'),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('campaigns_product_idx').on(t.productId, t.createdAt.desc())],
)

export const themeStatus = pgEnum('theme_status', ['active', 'paused', 'archived'])

export const contentThemes = pgTable(
  'content_themes',
  {
    id: text('id').primaryKey().$defaultFn(newId),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    campaignId: text('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description').notNull(),
    keywords: text('keywords').array().notNull().default([]),
    status: themeStatus('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('content_themes_product_idx').on(t.productId, t.createdAt.desc())],
)

export type Campaign = typeof campaigns.$inferSelect
export type ContentTheme = typeof contentThemes.$inferSelect
