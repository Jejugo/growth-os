import {
  pgTable,
  text,
  timestamp,
  integer,
  pgEnum,
  jsonb,
  numeric,
  boolean,
  index,
  unique,
} from 'drizzle-orm/pg-core'
import { newId } from '@/lib/ids'
import { products } from '@/modules/products/schema'

// --- Dimensões de performance -----------------------------------------------

export const performanceDimension = pgEnum('performance_dimension', [
  'channel',
  'angle',
  'theme',
  'segment',
  'hook_pattern',
  'posting_hour',
  'format',
  'campaign',
])

export const windowKind = pgEnum('window_kind', ['7d', '28d', 'all'])

// --- Rollups de performance --------------------------------------------------

export const performanceRollups = pgTable(
  'performance_rollups',
  {
    id: text('id').primaryKey().$defaultFn(newId),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    dimension: performanceDimension('dimension').notNull(),
    dimensionValue: text('dimension_value').notNull(),
    windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
    windowEnd: timestamp('window_end', { withTimezone: true }).notNull(),
    windowKind: windowKind('window_kind').notNull(),
    posts: integer('posts').notNull().default(0),
    impressions: integer('impressions').notNull().default(0),
    clicks: integer('clicks').notNull().default(0),
    signups: integer('signups').notNull().default(0),
    activations: integer('activations').notNull().default(0),
    paid: integer('paid').notNull().default(0),
    revenue: numeric('revenue', { precision: 12, scale: 2 }).notNull().default('0'),
    clickRate: numeric('click_rate', { precision: 6, scale: 4 }).notNull().default('0'),
    signupRate: numeric('signup_rate', { precision: 6, scale: 4 }).notNull().default('0'),
    paidRate: numeric('paid_rate', { precision: 6, scale: 4 }).notNull().default('0'),
    sampleSufficient: boolean('sample_sufficient').notNull().default(false),
    computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('performance_rollups_product_idx').on(t.productId, t.dimension, t.windowKind),
    unique('performance_rollups_unique').on(
      t.productId,
      t.dimension,
      t.dimensionValue,
      t.windowKind,
      t.windowEnd,
    ),
  ],
)

// --- Aprendizados ------------------------------------------------------------

export const learningKind = pgEnum('learning_kind', ['hypothesis', 'learning'])

export const learningDirection = pgEnum('learning_direction', [
  'increase',
  'decrease',
  'keep',
  'test',
])

export const learningStatus = pgEnum('learning_status', ['active', 'superseded', 'dismissed'])

export const learnings = pgTable(
  'learnings',
  {
    id: text('id').primaryKey().$defaultFn(newId),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    statement: text('statement').notNull(),
    kind: learningKind('kind').notNull().default('hypothesis'),
    direction: learningDirection('direction').notNull(),
    dimension: performanceDimension('dimension').notNull(),
    dimensionValue: text('dimension_value').notNull(),
    // evidência: array de { rollupId, metric, value }
    evidence: jsonb('evidence').notNull().default([]),
    // 0.00 a 1.00 — função determinística de amostra e efeito
    confidence: numeric('confidence', { precision: 3, scale: 2 }).notNull().default('0'),
    status: learningStatus('status').notNull().default('active'),
    appliedToPrompt: boolean('applied_to_prompt').notNull().default(false),
    aiCallId: text('ai_call_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    // ID do learning que este substituiu
    supersededBy: text('superseded_by'),
  },
  (t) => [index('learnings_product_idx').on(t.productId, t.status, t.createdAt.desc())],
)

// --- Motor de experimentos (extensão do esquema em content/schema.ts) -------

export const experimentDimension = pgEnum('experiment_dimension', [
  'hook',
  'cta',
  'audience',
  'channel',
  'topic',
  'format',
  'angle',
  'posting_time',
])

export const experimentPrimaryMetric = pgEnum('experiment_primary_metric', [
  'paid',
  'activation',
  'signup',
  'qualified_visit',
  'engagement',
])

export const experimentStatus = pgEnum('experiment_status', [
  'draft',
  'running',
  'concluded',
  'abandoned',
])

export const experimentExposures = pgTable(
  'experiment_exposures',
  {
    id: text('id').primaryKey().$defaultFn(newId),
    // Sem FK formal para experiments/variants para evitar acoplamento circular
    experimentId: text('experiment_id').notNull(),
    variantId: text('variant_id').notNull(),
    postId: text('post_id'),
    publicationId: text('publication_id'),
    assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('experiment_exposures_exp_idx').on(t.experimentId, t.assignedAt.desc())],
)

// --- Tipos inferidos --------------------------------------------------------

export type PerformanceRollup = typeof performanceRollups.$inferSelect
export type Learning = typeof learnings.$inferSelect
export type ExperimentExposure = typeof experimentExposures.$inferSelect
