import { pgTable, text, timestamp, integer, numeric, pgEnum, index, unique, jsonb } from 'drizzle-orm/pg-core'
import { newId } from '@/lib/ids'
import { products, productStage } from '@/modules/products/schema'
import { campaigns, contentThemes } from '@/modules/campaigns/schema'
import { experiments } from '@/modules/content/schema'
import type { RiskReview } from '@/modules/content/types'
import type { LandingPageCopy, CustomLandingFile, CustomLandingDraftHistoryEntry } from './landing/types'

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

// --- Landing page automática -------------------------------------------------

export const landingPageStatus = pgEnum('landing_page_status', [
  'generating',
  'ready',
  'blocked',
  'failed',
])

export const landingPageSource = pgEnum('landing_page_source', ['ai_generated', 'custom_upload'])

/**
 * Uma linha por tentativa de geração — regenerar depois de um "blocked" cria
 * outra linha em vez de sobrescrever, então o histórico de tentativas fica
 * visível. A mais recente é a landing ativa do produto.
 */
export const landingPages = pgTable(
  'landing_pages',
  {
    id: text('id').primaryKey().$defaultFn(newId),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    status: landingPageStatus('status').notNull().default('generating'),
    // 'custom_upload' — zip de HTML/CSS/JS feito fora e importado; sem copy/riskReview/aiCallId.
    source: landingPageSource('source').notNull().default('ai_generated'),
    // Nome do projeto Vercel — estável por produto (não por tentativa), para
    // que regenerar atualize o mesmo domínio em vez de criar um novo.
    slug: text('slug').notNull(),
    copy: jsonb('copy').$type<LandingPageCopy>(),
    html: text('html'),
    // Só em 'custom_upload' — arquivos validados do zip, guardados pra permitir pedir ajustes
    // por IA depois sem precisar reenviar o zip inteiro de novo.
    files: jsonb('files').$type<CustomLandingFile[]>(),
    riskReview: jsonb('risk_review').$type<RiskReview>(),
    vercelProjectId: text('vercel_project_id'),
    vercelDeploymentId: text('vercel_deployment_id'),
    deployUrl: text('deploy_url'),
    aiCallId: text('ai_call_id'),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('landing_pages_product_idx').on(t.productId, t.createdAt.desc())],
)

/**
 * Rascunho de landing customizada — um por produto. Existe pra separar "iterar" de "publicar":
 * pedir ajuste aqui só edita `files` e acrescenta em `history` (a IA vê o histórico inteiro, não só
 * o pedido mais recente), sem tocar na Vercel — o preview lê direto daqui (`/api/landing-drafts`).
 * `landing_pages` continua sendo só o histórico do que foi de fato publicado.
 */
export const landingPageDrafts = pgTable(
  'landing_page_drafts',
  {
    id: text('id').primaryKey().$defaultFn(newId),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    files: jsonb('files').$type<CustomLandingFile[]>().notNull(),
    history: jsonb('history').$type<CustomLandingDraftHistoryEntry[]>().notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('landing_page_drafts_product_unique').on(t.productId)],
)

export const waitlistSignups = pgTable(
  'waitlist_signups',
  {
    id: text('id').primaryKey().$defaultFn(newId),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    visitorId: text('visitor_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('waitlist_signups_product_email_unique').on(t.productId, t.email),
    index('waitlist_signups_product_idx').on(t.productId, t.createdAt.desc()),
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
export type LandingPage = typeof landingPages.$inferSelect
export type LandingPageDraft = typeof landingPageDrafts.$inferSelect
export type WaitlistSignup = typeof waitlistSignups.$inferSelect
