import { pgTable, text, timestamp, integer, numeric, pgEnum, index } from 'drizzle-orm/pg-core'
import { newId } from '@/lib/ids'
import { products, productStage } from '@/modules/products/schema'
import { campaigns, contentThemes } from '@/modules/campaigns/schema'
import { experiments } from '@/modules/content/schema'

// --- Brief da ideia -------------------------------------------------------

export const productBriefs = pgTable(
  'product_briefs',
  {
    id: text('id').primaryKey().$defaultFn(newId),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    problem: text('problem').notNull(),
    audience: text('audience').notNull(),
    solutionSketch: text('solution_sketch').notNull(),
    whyNow: text('why_now'),
    alternatives: text('alternatives'),
    // O que precisa ser verdade para a ideia existir — vira a hipótese do teste.
    riskiestAssumption: text('riskiest_assumption').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('product_briefs_product_idx').on(t.productId, t.createdAt.desc())],
)

// --- Validação -------------------------------------------------------------

export const validationStatus = pgEnum('validation_status', [
  'draft',
  'running',
  'concluded',
  'aborted',
])

export const validationVerdict = pgEnum('validation_verdict', [
  'build',
  'pivot',
  'kill',
  'inconclusive',
])

export const validations = pgTable(
  'validations',
  {
    id: text('id').primaryKey().$defaultFn(newId),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    briefId: text('brief_id')
      .notNull()
      .references(() => productBriefs.id, { onDelete: 'cascade' }),
    // Campanha/tema criados para esta validação — reusam o motor de conteúdo
    // das fases 1-2 sem duplicar tabela nenhuma.
    campaignId: text('campaign_id').references(() => campaigns.id, { onDelete: 'set null' }),
    contentThemeId: text('content_theme_id').references(() => contentThemes.id, {
      onDelete: 'set null',
    }),
    // Experimento de ângulo de posicionamento (tabela existente da fase 4).
    experimentId: text('experiment_id').references(() => experiments.id, { onDelete: 'set null' }),

    hypothesis: text('hypothesis').notNull(), // deriva de riskiestAssumption
    landingUrl: text('landing_url').notNull(),
    status: validationStatus('status').notNull().default('draft'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    endsAt: timestamp('ends_at', { withTimezone: true }),

    // Limiares — gravados na criação, nunca editáveis depois de 'running'.
    minVisitors: integer('min_visitors').notNull().default(300),
    minSignups: integer('min_signups').notNull().default(100),
    minSignupRate: numeric('min_signup_rate', { precision: 5, scale: 4 }).notNull().default('0.0400'),
    minStrongSignals: integer('min_strong_signals').notNull().default(5),

    verdict: validationVerdict('verdict'),
    verdictReason: text('verdict_reason'),
    pivotSuggestions: text('pivot_suggestions').array(),
    verdictAt: timestamp('verdict_at', { withTimezone: true }),
    aiCallId: text('ai_call_id'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('validations_product_idx').on(t.productId, t.createdAt.desc()),
    index('validations_status_idx').on(t.status, t.endsAt),
  ],
)

// --- Histórico de estágio ---------------------------------------------------

export const stageActor = pgEnum('stage_actor', ['human', 'system'])

export const productStageEvents = pgTable(
  'product_stage_events',
  {
    id: text('id').primaryKey().$defaultFn(newId),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    fromStage: productStage('from_stage'),
    toStage: productStage('to_stage').notNull(),
    actor: stageActor('actor').notNull(),
    reason: text('reason'),
    validationId: text('validation_id').references(() => validations.id, { onDelete: 'set null' }),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('product_stage_events_product_idx').on(t.productId, t.occurredAt.desc())],
)

// --- Tipos inferidos ---------------------------------------------------------

export type ProductBrief = typeof productBriefs.$inferSelect
export type Validation = typeof validations.$inferSelect
export type ProductStageEvent = typeof productStageEvents.$inferSelect
