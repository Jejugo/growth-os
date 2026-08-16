import { pgTable, text, integer, timestamp, pgEnum, index } from 'drizzle-orm/pg-core'
import { newId } from '@/lib/ids'
import { products } from '@/modules/products/schema'

export const segmentStatus = pgEnum('segment_status', ['active', 'paused', 'archived'])
export const scoreSource = pgEnum('score_source', ['ai_estimate', 'measured'])

export const audienceSegments = pgTable(
  'audience_segments',
  {
    id: text('id').primaryKey().$defaultFn(newId),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description').notNull(),
    locations: text('locations').array().notNull().default([]),
    professions: text('professions').array().notNull().default([]),
    seniority: text('seniority').array().notNull().default([]),
    interests: text('interests').array().notNull().default([]),
    painPoints: text('pain_points').array().notNull().default([]),
    keywords: text('keywords').array().notNull().default([]),
    audienceFitScore: integer('audience_fit_score').notNull().default(0),
    problemIntensityScore: integer('problem_intensity_score').notNull().default(0),
    conversionPotentialScore: integer('conversion_potential_score').notNull().default(0),
    scoreSource: scoreSource('score_source').notNull().default('ai_estimate'),
    status: segmentStatus('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('audience_segments_product_idx').on(t.productId, t.createdAt.desc())],
)

export type AudienceSegment = typeof audienceSegments.$inferSelect
