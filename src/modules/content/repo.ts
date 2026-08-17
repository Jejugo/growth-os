import { and, desc, eq, gt, sql, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  contentIdeas,
  contentAssets,
  socialPosts,
  contentFingerprints,
  contentFeedback,
} from './schema'
import type {
  ContentIdea,
  ContentAsset,
  SocialPost,
  ContentFingerprint,
  ContentFeedback,
} from './schema'
import type { RiskReview } from './types'

// --- Ideias -------------------------------------------------------------

export async function insertIdea(row: {
  productId: string
  campaignId: string
  themeId: string
  audienceSegmentId?: string | null
  title: string
  summary: string
  angle: ContentIdea['angle']
  supportingFacts?: unknown
}): Promise<ContentIdea> {
  const [created] = await db.insert(contentIdeas).values(row).returning()
  return created!
}

export async function listIdeas(productId: string, campaignId?: string): Promise<ContentIdea[]> {
  return db
    .select()
    .from(contentIdeas)
    .where(
      and(
        eq(contentIdeas.productId, productId),
        campaignId ? eq(contentIdeas.campaignId, campaignId) : undefined,
      ),
    )
    .orderBy(desc(contentIdeas.createdAt))
}

export async function findIdea(id: string): Promise<ContentIdea | undefined> {
  const [found] = await db.select().from(contentIdeas).where(eq(contentIdeas.id, id)).limit(1)
  return found
}

export async function setIdeaStatus(
  id: string,
  status: ContentIdea['status'],
  rejectionReason?: string | null,
): Promise<void> {
  await db
    .update(contentIdeas)
    .set({ status, rejectionReason: rejectionReason ?? null, updatedAt: sql`now()` })
    .where(eq(contentIdeas.id, id))
}

export async function recentAngleUsage(
  productId: string,
  days = 30,
): Promise<Record<string, number>> {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const rows = await db
    .select({
      angle: contentIdeas.angle,
      count: sql<number>`count(*)::int`,
    })
    .from(contentIdeas)
    .where(
      and(
        eq(contentIdeas.productId, productId),
        gt(contentIdeas.createdAt, cutoff),
      ),
    )
    .groupBy(contentIdeas.angle)

  return Object.fromEntries(rows.map((r) => [r.angle, r.count]))
}

// --- Assets -------------------------------------------------------------

export async function insertAsset(row: {
  productId: string
  ideaId: string
  type: ContentAsset['type']
  title: string
  body: string
}): Promise<ContentAsset> {
  const [created] = await db.insert(contentAssets).values(row).returning()
  return created!
}

// --- Posts sociais ------------------------------------------------------

export async function insertPost(row: {
  productId: string
  ideaId: string
  assetId?: string | null
  campaignId: string
  channel: SocialPost['channel']
  hook: string
  body: string
  cta?: string | null
  ctaType?: SocialPost['ctaType']
  linkUrl?: string | null
  riskReview?: RiskReview | null
  status?: SocialPost['status']
}): Promise<SocialPost> {
  const [created] = await db.insert(socialPosts).values(row).returning()
  return created!
}

export async function listPosts(productId: string, campaignId?: string): Promise<SocialPost[]> {
  return db
    .select()
    .from(socialPosts)
    .where(
      and(
        eq(socialPosts.productId, productId),
        campaignId ? eq(socialPosts.campaignId, campaignId) : undefined,
      ),
    )
    .orderBy(desc(socialPosts.createdAt))
}

export async function findPost(id: string): Promise<SocialPost | undefined> {
  const [found] = await db.select().from(socialPosts).where(eq(socialPosts.id, id)).limit(1)
  return found
}

export async function setPostStatus(
  id: string,
  status: SocialPost['status'],
  rejectionReason?: string | null,
): Promise<void> {
  await db
    .update(socialPosts)
    .set({ status, rejectionReason: rejectionReason ?? null, updatedAt: sql`now()` })
    .where(eq(socialPosts.id, id))
}

export async function setPostRiskReview(id: string, review: RiskReview): Promise<void> {
  await db
    .update(socialPosts)
    .set({ riskReview: review, updatedAt: sql`now()` })
    .where(eq(socialPosts.id, id))
}

export async function setPostBody(
  id: string,
  fields: { hook?: string; body?: string; cta?: string | null; linkUrl?: string | null },
): Promise<void> {
  await db
    .update(socialPosts)
    .set({ ...fields, updatedAt: sql`now()` })
    .where(eq(socialPosts.id, id))
}

/**
 * Últimos N posts do produto para alimentar memória no prompt de redação.
 */
export async function recentPostsMemory(
  productId: string,
  limit = 20,
): Promise<Array<Pick<SocialPost, 'id' | 'hook' | 'body' | 'cta' | 'channel' | 'rejectionReason'>>> {
  return db
    .select({
      id: socialPosts.id,
      hook: socialPosts.hook,
      body: socialPosts.body,
      cta: socialPosts.cta,
      channel: socialPosts.channel,
      rejectionReason: socialPosts.rejectionReason,
    })
    .from(socialPosts)
    .where(eq(socialPosts.productId, productId))
    .orderBy(desc(socialPosts.createdAt))
    .limit(limit)
}

// --- Fingerprints -------------------------------------------------------

export async function insertFingerprint(row: {
  productId: string
  postId?: string | null
  ideaId?: string | null
  kind: ContentFingerprint['kind']
  normalizedText: string
  hash: string
}): Promise<void> {
  await db.insert(contentFingerprints).values(row)
}

export async function insertFingerprints(
  rows: Array<{
    productId: string
    postId?: string | null
    ideaId?: string | null
    kind: ContentFingerprint['kind']
    normalizedText: string
    hash: string
  }>,
): Promise<void> {
  if (rows.length === 0) return
  await db.insert(contentFingerprints).values(rows)
}

export async function findExactFingerprint(
  productId: string,
  kind: ContentFingerprint['kind'],
  hash: string,
  days = 90,
): Promise<ContentFingerprint | undefined> {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const [found] = await db
    .select()
    .from(contentFingerprints)
    .where(
      and(
        eq(contentFingerprints.productId, productId),
        eq(contentFingerprints.kind, kind),
        eq(contentFingerprints.hash, hash),
        gt(contentFingerprints.createdAt, cutoff),
      ),
    )
    .limit(1)
  return found
}

/**
 * Busca fingerprints similares por trigrama (pg_trgm). Retorna os N mais
 * próximos acima do limiar mínimo, dentro da janela de 90 dias.
 */
export async function findSimilarFingerprints(
  productId: string,
  kind: ContentFingerprint['kind'],
  normalizedText: string,
  minSimilarity = 0.6,
  days = 90,
): Promise<Array<{ id: string; postId: string | null; ideaId: string | null; normalizedText: string; similarity: number }>> {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  return db
    .select({
      id: contentFingerprints.id,
      postId: contentFingerprints.postId,
      ideaId: contentFingerprints.ideaId,
      normalizedText: contentFingerprints.normalizedText,
      similarity: sql<number>`similarity(${contentFingerprints.normalizedText}, ${normalizedText})`,
    })
    .from(contentFingerprints)
    .where(
      and(
        eq(contentFingerprints.productId, productId),
        eq(contentFingerprints.kind, kind),
        gt(contentFingerprints.createdAt, cutoff),
        sql`similarity(${contentFingerprints.normalizedText}, ${normalizedText}) > ${minSimilarity}`,
      ),
    )
    .orderBy(sql`similarity(${contentFingerprints.normalizedText}, ${normalizedText}) DESC`)
    .limit(3)
}

// --- Feedback -----------------------------------------------------------

export async function insertFeedback(row: {
  productId: string
  postId?: string | null
  ideaId?: string | null
  action: ContentFeedback['action']
  reason?: string | null
  editedFrom?: string | null
  editedTo?: string | null
}): Promise<void> {
  await db.insert(contentFeedback).values(row)
}

export async function recentRejectionReasons(
  productId: string,
  limit = 10,
): Promise<string[]> {
  const rows = await db
    .select({ reason: contentFeedback.reason })
    .from(contentFeedback)
    .where(
      and(
        eq(contentFeedback.productId, productId),
        eq(contentFeedback.action, 'rejected'),
        sql`${contentFeedback.reason} is not null`,
      ),
    )
    .orderBy(desc(contentFeedback.createdAt))
    .limit(limit)

  return rows.map((r) => r.reason!).filter(Boolean)
}
