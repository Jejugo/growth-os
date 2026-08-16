import { pgTable, text, timestamp, jsonb, pgEnum, index } from 'drizzle-orm/pg-core'
import { newId } from '@/lib/ids'

export const jobStatus = pgEnum('job_status', [
  'started',
  'completed',
  'failed',
  'retried',
  'cancelled',
])

/**
 * Espelho local dos runs do Trigger.dev. O `idempotencyKey` é unique: é ele
 * que impede dois disparos concorrentes de fazerem o mesmo trabalho duas vezes.
 */
export const jobRuns = pgTable(
  'job_runs',
  {
    id: text('id').primaryKey().$defaultFn(newId),
    taskName: text('task_name').notNull(),
    idempotencyKey: text('idempotency_key').notNull().unique(),
    productId: text('product_id'),
    status: jobStatus('status').notNull(),
    triggerRunId: text('trigger_run_id'),
    input: jsonb('input').$type<Record<string, unknown>>(),
    result: jsonb('result').$type<Record<string, unknown>>(),
    error: jsonb('error').$type<{ message: string; stack?: string }>(),
    attempt: text('attempt'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
  },
  (t) => [index('job_runs_product_started_idx').on(t.productId, t.startedAt.desc())],
)

/**
 * Por que o sistema fez o que fez. Sem isto, comportamento autônomo vira
 * caixa-preta exatamente quando começa a importar (init.md §30, prioridade 3).
 */
export const decisions = pgTable(
  'decisions',
  {
    id: text('id').primaryKey().$defaultFn(newId),
    productId: text('product_id'),
    actor: text('actor').notNull(),
    decision: text('decision').notNull(),
    rationale: text('rationale').notNull(),
    inputsSnapshot: jsonb('inputs_snapshot').$type<Record<string, unknown>>(),
    aiCallId: text('ai_call_id'),
    jobRunId: text('job_run_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('decisions_product_created_idx').on(t.productId, t.createdAt.desc())],
)

export type JobRun = typeof jobRuns.$inferSelect
export type Decision = typeof decisions.$inferSelect
