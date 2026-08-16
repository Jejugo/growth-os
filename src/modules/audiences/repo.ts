import { and, desc, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { audienceSegments } from './schema'
import type { AudienceSegment } from './schema'
import type { DerivedSegment } from './types'

export async function insertSegments(
  productId: string,
  segments: DerivedSegment[],
): Promise<AudienceSegment[]> {
  return db
    .insert(audienceSegments)
    .values(
      segments.map((s) => ({
        productId,
        name: s.name,
        description: s.description,
        locations: s.locations,
        professions: s.professions,
        seniority: s.seniority,
        interests: s.interests,
        painPoints: s.painPoints,
        keywords: s.keywords,
        audienceFitScore: s.audienceFitScore,
        problemIntensityScore: s.problemIntensityScore,
        conversionPotentialScore: s.conversionPotentialScore,
      })),
    )
    .returning()
}

export async function listSegments(productId: string): Promise<AudienceSegment[]> {
  return db
    .select()
    .from(audienceSegments)
    .where(
      and(
        eq(audienceSegments.productId, productId),
        eq(audienceSegments.status, 'active'),
      ),
    )
    .orderBy(desc(audienceSegments.audienceFitScore))
}

export async function findSegment(id: string): Promise<AudienceSegment | undefined> {
  const [found] = await db
    .select()
    .from(audienceSegments)
    .where(eq(audienceSegments.id, id))
    .limit(1)
  return found
}

export async function setSegmentStatus(
  id: string,
  status: 'active' | 'paused' | 'archived',
): Promise<void> {
  await db
    .update(audienceSegments)
    .set({ status, updatedAt: sql`now()` })
    .where(eq(audienceSegments.id, id))
}

export async function countActiveSegments(productId: string): Promise<number> {
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(audienceSegments)
    .where(
      and(
        eq(audienceSegments.productId, productId),
        eq(audienceSegments.status, 'active'),
      ),
    )
  return result?.count ?? 0
}
