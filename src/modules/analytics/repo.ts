import { and, eq, desc, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { performanceRollups, learnings } from './schema'
import type { PerformanceRollup, Learning } from './schema'

// --- Performance Rollups ---------------------------------------------------

export async function hasAnyLearningOrRollup(productId: string): Promise<boolean> {
  const [rollupRow, learningRow] = await Promise.all([
    db
      .select({ id: performanceRollups.id })
      .from(performanceRollups)
      .where(eq(performanceRollups.productId, productId))
      .limit(1),
    db.select({ id: learnings.id }).from(learnings).where(eq(learnings.productId, productId)).limit(1),
  ])
  return rollupRow.length > 0 || learningRow.length > 0
}

export async function getRollupsByDimension(
  productId: string,
  dimension: PerformanceRollup['dimension'],
  windowKind: PerformanceRollup['windowKind'] = '28d',
): Promise<PerformanceRollup[]> {
  return db
    .select()
    .from(performanceRollups)
    .where(
      and(
        eq(performanceRollups.productId, productId),
        eq(performanceRollups.dimension, dimension),
        eq(performanceRollups.windowKind, windowKind),
      ),
    )
    .orderBy(desc(performanceRollups.computedAt))
}

export async function getAllRollupsForProduct(
  productId: string,
  windowKind: PerformanceRollup['windowKind'] = '28d',
): Promise<PerformanceRollup[]> {
  return db
    .select()
    .from(performanceRollups)
    .where(
      and(
        eq(performanceRollups.productId, productId),
        eq(performanceRollups.windowKind, windowKind),
      ),
    )
    .orderBy(performanceRollups.dimension, desc(performanceRollups.signupRate))
}

export async function getRollupById(id: string): Promise<PerformanceRollup | null> {
  const [row] = await db
    .select()
    .from(performanceRollups)
    .where(eq(performanceRollups.id, id))
    .limit(1)
  return row ?? null
}

export async function getRollupsByIds(ids: string[]): Promise<PerformanceRollup[]> {
  if (ids.length === 0) return []
  return db.select().from(performanceRollups).where(inArray(performanceRollups.id, ids))
}

// --- Learnings -----------------------------------------------------------

export async function listActiveLearnings(productId: string): Promise<Learning[]> {
  return db
    .select()
    .from(learnings)
    .where(and(eq(learnings.productId, productId), eq(learnings.status, 'active')))
    .orderBy(desc(learnings.confidence), desc(learnings.createdAt))
}

export async function listLearnings(
  productId: string,
  status?: Learning['status'],
): Promise<Learning[]> {
  const conditions = [eq(learnings.productId, productId)]
  if (status) conditions.push(eq(learnings.status, status))

  return db
    .select()
    .from(learnings)
    .where(and(...conditions))
    .orderBy(desc(learnings.createdAt))
}

export async function insertLearning(
  row: Omit<typeof learnings.$inferInsert, 'id' | 'createdAt'>,
): Promise<Learning> {
  const [result] = await db.insert(learnings).values(row).returning()
  return result!
}

export async function supersedeLearning(id: string, newLearningId: string): Promise<void> {
  await db
    .update(learnings)
    .set({ status: 'superseded', supersededBy: newLearningId })
    .where(eq(learnings.id, id))
}

export async function dismissLearning(id: string, productId: string): Promise<void> {
  await db
    .update(learnings)
    .set({ status: 'dismissed' })
    .where(and(eq(learnings.id, id), eq(learnings.productId, productId)))
}

export async function markLearningApplied(id: string): Promise<void> {
  await db
    .update(learnings)
    .set({ appliedToPrompt: true })
    .where(eq(learnings.id, id))
}

/**
 * Retorna aprendizados ativos para uma dimensão específica.
 * Usado pelo pipeline de geração de conteúdo.
 */
export async function getActiveLearningsForDimension(
  productId: string,
  dimension: PerformanceRollup['dimension'],
): Promise<Learning[]> {
  return db
    .select()
    .from(learnings)
    .where(
      and(
        eq(learnings.productId, productId),
        eq(learnings.status, 'active'),
        eq(learnings.dimension, dimension),
      ),
    )
    .orderBy(desc(learnings.confidence))
}
