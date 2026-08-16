import { and, eq, gte, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { aiCalls } from './schema'
import type { ModelTier } from './config'

export async function insertAiCall(row: {
  task: string
  promptVersion: string
  tier: ModelTier
  model: string
  productId?: string
  missionId?: string
  campaignId?: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  costUsd: number
  latencyMs: number
  attempt: number
  status: 'ok' | 'invalid' | 'error'
  errorMessage?: string
}): Promise<string> {
  const [inserted] = await db
    .insert(aiCalls)
    .values({ ...row, costUsd: row.costUsd.toFixed(6) })
    .returning({ id: aiCalls.id })
  return inserted!.id
}

/** Gasto de LLM do produto desde uma data — insumo do guarda de orçamento. */
export async function spendSince(productId: string, since: Date): Promise<number> {
  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(${aiCalls.costUsd}), 0)` })
    .from(aiCalls)
    .where(and(eq(aiCalls.productId, productId), gte(aiCalls.createdAt, since)))
  return Number(row?.total ?? 0)
}

export async function spendThisMonth(productId: string): Promise<number> {
  return spendSince(productId, monthStart())
}

/** Gasto total do mês, somando todos os produtos — cabeçalho do painel. */
export async function totalSpendThisMonth(): Promise<{ costUsd: number; calls: number }> {
  const [row] = await db
    .select({
      total: sql<string>`coalesce(sum(${aiCalls.costUsd}), 0)`,
      calls: sql<number>`count(*)::int`,
    })
    .from(aiCalls)
    .where(gte(aiCalls.createdAt, monthStart()))
  return { costUsd: Number(row?.total ?? 0), calls: row?.calls ?? 0 }
}

function monthStart(): Date {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
}
