import { eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { jobRuns, decisions } from './schema'

export type JobStatus = 'started' | 'completed' | 'failed' | 'retried' | 'cancelled'

/**
 * Reivindica a execução de um job. O INSERT com unique em `idempotencyKey` é
 * o que garante exclusão mútua — dois workers concorrentes disputam a linha e
 * apenas um vence, independentemente do que o Trigger.dev faça com retries.
 *
 * Retorna `null` quando outro run já concluiu este trabalho.
 * Em retry do mesmo run (status `failed`), devolve a linha para retomada.
 */
export async function claimJobRun(input: {
  taskName: string
  idempotencyKey: string
  productId?: string
  triggerRunId?: string
  payload?: Record<string, unknown>
}): Promise<{ id: string; resumed: boolean } | null> {
  const [claimed] = await db
    .insert(jobRuns)
    .values({
      taskName: input.taskName,
      idempotencyKey: input.idempotencyKey,
      productId: input.productId,
      triggerRunId: input.triggerRunId,
      status: 'started',
      input: input.payload,
    })
    .onConflictDoNothing({ target: jobRuns.idempotencyKey })
    .returning({ id: jobRuns.id })

  if (claimed) return { id: claimed.id, resumed: false }

  // Já existe: só retomamos o que falhou. `completed` significa trabalho feito.
  const [existing] = await db
    .select({ id: jobRuns.id, status: jobRuns.status })
    .from(jobRuns)
    .where(eq(jobRuns.idempotencyKey, input.idempotencyKey))
    .limit(1)

  if (!existing || existing.status === 'completed') return null

  await db
    .update(jobRuns)
    .set({ status: 'retried', endedAt: null, error: null })
    .where(eq(jobRuns.id, existing.id))

  return { id: existing.id, resumed: true }
}

export async function finishJobRun(
  jobRunId: string,
  status: Extract<JobStatus, 'completed' | 'failed' | 'cancelled'>,
  detail?: { result?: Record<string, unknown>; error?: unknown },
): Promise<void> {
  await db
    .update(jobRuns)
    .set({
      status,
      endedAt: sql`now()`,
      result: detail?.result,
      error: detail?.error ? serializeError(detail.error) : undefined,
    })
    .where(eq(jobRuns.id, jobRunId))
}

export async function recordDecision(input: {
  productId?: string
  actor: string
  decision: string
  rationale: string
  inputsSnapshot?: Record<string, unknown>
  aiCallId?: string
  jobRunId?: string
}): Promise<void> {
  await db.insert(decisions).values(input)
}

function serializeError(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) return { message: error.message, stack: error.stack }
  return { message: String(error) }
}
