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
  check,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { newId } from '@/lib/ids'
import type { ProfileData } from './types'

export const productStatus = pgEnum('product_status', ['active', 'paused', 'archived'])
/**
 * Ciclo de vida do produto (fase 4.5). Ortogonal a `status`: um produto pode
 * estar `validating` e `paused` ao mesmo tempo.
 */
export const productStage = pgEnum('product_stage', ['idea', 'validating', 'building', 'launched'])
export const pageRole = pgEnum('page_role', [
  'home',
  'pricing',
  'features',
  'about',
  'docs',
  'blog',
  'other',
])
export const profileSource = pgEnum('profile_source', ['ai', 'human', 'merged'])
export const analysisStatus = pgEnum('analysis_status', [
  'never',
  'running',
  'ok',
  'failed',
])

export const products = pgTable(
  'products',
  {
    id: text('id').primaryKey().$defaultFn(newId),
    name: text('name').notNull(),
    // NULLABLE (fase 4.5): uma ideia em `stage = 'idea'` ainda não tem site.
    url: text('url'),
    domain: text('domain').unique(),
    stage: productStage('stage').notNull().default('launched'),
    status: productStatus('status').notNull().default('active'),
    analysisStatus: analysisStatus('analysis_status').notNull().default('never'),
    analysisError: text('analysis_error'),
    lastAnalyzedAt: timestamp('last_analyzed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('products_created_idx').on(t.createdAt.desc()),
    // A partir de 'validating' existe landing page — só 'idea' pode ficar sem URL.
    check(
      'products_url_domain_stage_check',
      sql`(${t.stage} = 'idea') OR (${t.url} IS NOT NULL AND ${t.domain} IS NOT NULL)`,
    ),
  ],
)

/**
 * Snapshot bruto de cada página lida. O unique em (produto, url, hash) é o que
 * torna o recrawl barato: conteúdo idêntico não vira snapshot novo, e o passo
 * de extração factual não gasta tokens de novo (init.md §5).
 */
export const productCrawlSnapshots = pgTable(
  'product_crawl_snapshots',
  {
    id: text('id').primaryKey().$defaultFn(newId),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    crawlBatchId: text('crawl_batch_id').notNull(),
    pageUrl: text('page_url').notNull(),
    pageRole: pageRole('page_role').notNull(),
    httpStatus: integer('http_status').notNull(),
    title: text('title'),
    extractedText: text('extracted_text').notNull(),
    contentHash: text('content_hash').notNull(),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('crawl_snapshot_unique').on(t.productId, t.pageUrl, t.contentHash),
    index('crawl_snapshots_product_idx').on(t.productId, t.fetchedAt.desc()),
  ],
)

/**
 * Perfil versionado. Nova análise nunca sobrescreve edição humana: os campos
 * em `lockedFields` são preservados e a versão nasce como `merged`.
 */
export const productProfiles = pgTable(
  'product_profiles',
  {
    id: text('id').primaryKey().$defaultFn(newId),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    isCurrent: boolean('is_current').notNull().default(false),
    source: profileSource('source').notNull(),
    promptVersion: text('prompt_version'),
    crawlBatchId: text('crawl_batch_id'),

    productName: text('product_name'),
    oneLiner: text('one_liner'),
    primaryProblem: text('primary_problem'),
    valueProposition: text('value_proposition'),
    pricingSummary: text('pricing_summary'),

    data: jsonb('data').$type<ProfileData>().notNull(),

    lockedFields: text('locked_fields').array().notNull().default([]),
    confidence: jsonb('confidence').$type<Record<string, number>>(),
    lowConfidence: boolean('low_confidence').notNull().default(false),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('product_profile_version_unique').on(t.productId, t.version),
    index('product_profiles_current_idx').on(t.productId, t.isCurrent),
  ],
)

export type Product = typeof products.$inferSelect
export type ProductStage = Product['stage']
export type ProductProfile = typeof productProfiles.$inferSelect
export type CrawlSnapshot = typeof productCrawlSnapshots.$inferSelect
