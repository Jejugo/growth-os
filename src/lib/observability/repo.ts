import { desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { jobRuns, decisions } from './schema'
import type { JobRun, Decision } from './schema'

export async function recentJobRuns(limit = 8): Promise<JobRun[]> {
  return db.select().from(jobRuns).orderBy(desc(jobRuns.startedAt)).limit(limit)
}

export async function recentDecisions(productId: string, limit = 10): Promise<Decision[]> {
  return db
    .select()
    .from(decisions)
    .where(eq(decisions.productId, productId))
    .orderBy(desc(decisions.createdAt))
    .limit(limit)
}
