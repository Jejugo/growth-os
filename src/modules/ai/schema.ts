import { pgTable, text, timestamp, integer, numeric, pgEnum, index } from 'drizzle-orm/pg-core'
import { newId } from '@/lib/ids'

export const aiCallStatus = pgEnum('ai_call_status', ['ok', 'invalid', 'error'])
export const aiTier = pgEnum('ai_tier', ['cheap', 'standard', 'strong'])

/**
 * Uma linha por chamada de LLM — inclusive as que falharam. É a base do
 * controle de custo por produto/campanha/missão (init.md §30, prioridade 4).
 *
 * Dinheiro em numeric(12,6): custos de LLM são frações de centavo e float
 * acumula erro ao somar milhares de chamadas.
 */
export const aiCalls = pgTable(
  'ai_calls',
  {
    id: text('id').primaryKey().$defaultFn(newId),
    task: text('task').notNull(),
    promptVersion: text('prompt_version').notNull(),
    tier: aiTier('tier').notNull(),
    model: text('model').notNull(),

    productId: text('product_id'),
    missionId: text('mission_id'),
    campaignId: text('campaign_id'),

    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    cacheReadTokens: integer('cache_read_tokens').notNull().default(0),
    cacheWriteTokens: integer('cache_write_tokens').notNull().default(0),
    costUsd: numeric('cost_usd', { precision: 12, scale: 6 }).notNull().default('0'),

    latencyMs: integer('latency_ms').notNull().default(0),
    attempt: integer('attempt').notNull().default(1),
    status: aiCallStatus('status').notNull(),
    errorMessage: text('error_message'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('ai_calls_product_created_idx').on(t.productId, t.createdAt.desc())],
)

export type AiCall = typeof aiCalls.$inferSelect
