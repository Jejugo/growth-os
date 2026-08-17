import { and, eq, gt, sql, isNull, desc } from 'drizzle-orm'
import { randomBytes, createHash } from 'node:crypto'
import { db } from '@/lib/db'
import { trackingLinks, visitors, growthEvents, ingestKeys } from './schema'
import type { TrackingLink, Visitor, GrowthEvent, IngestKey } from './schema'

// --- Tracking Links ---------------------------------------------------------

export async function findTrackingLinkByCode(code: string): Promise<TrackingLink | null> {
  const [link] = await db
    .select()
    .from(trackingLinks)
    .where(eq(trackingLinks.code, code))
    .limit(1)
  return link ?? null
}

export async function findTrackingLinkByRef(
  ref: string,
  productId: string,
): Promise<TrackingLink | null> {
  const [link] = await db
    .select()
    .from(trackingLinks)
    .where(and(eq(trackingLinks.ref, ref), eq(trackingLinks.productId, productId)))
    .limit(1)
  return link ?? null
}

export async function incrementClickCount(linkId: string): Promise<void> {
  await db
    .update(trackingLinks)
    .set({ clickCount: sql`${trackingLinks.clickCount} + 1` })
    .where(eq(trackingLinks.id, linkId))
}

export async function findTrackingLinkByPostAndPublication(
  postId: string,
  publicationId: string,
): Promise<TrackingLink | null> {
  const [link] = await db
    .select()
    .from(trackingLinks)
    .where(
      and(eq(trackingLinks.postId, postId), eq(trackingLinks.publicationId, publicationId)),
    )
    .limit(1)
  return link ?? null
}

// --- Visitors ---------------------------------------------------------------

export async function upsertVisitor(params: {
  productId: string
  visitorId: string
  trackingLinkId?: string | null
  externalUserId?: string | null
}): Promise<Visitor> {
  const now = new Date()

  // Tenta upsert usando ON CONFLICT
  const [existing] = await db
    .select()
    .from(visitors)
    .where(
      and(eq(visitors.productId, params.productId), eq(visitors.visitorId, params.visitorId)),
    )
    .limit(1)

  if (existing) {
    const updates: Partial<typeof visitors.$inferInsert> = {
      lastSeenAt: now,
    }
    if (params.trackingLinkId) updates.lastTrackingLinkId = params.trackingLinkId
    if (params.externalUserId) updates.externalUserId = params.externalUserId

    const [updated] = await db
      .update(visitors)
      .set(updates)
      .where(eq(visitors.id, existing.id))
      .returning()
    return updated!
  }

  const [created] = await db
    .insert(visitors)
    .values({
      productId: params.productId,
      visitorId: params.visitorId,
      firstSeenAt: now,
      lastSeenAt: now,
      firstTrackingLinkId: params.trackingLinkId ?? null,
      lastTrackingLinkId: params.trackingLinkId ?? null,
      externalUserId: params.externalUserId ?? null,
    })
    .onConflictDoUpdate({
      target: [visitors.productId, visitors.visitorId],
      set: {
        lastSeenAt: now,
        lastTrackingLinkId: params.trackingLinkId ?? sql`${visitors.lastTrackingLinkId}`,
        externalUserId: params.externalUserId ?? sql`${visitors.externalUserId}`,
      },
    })
    .returning()
  return created!
}

/**
 * Retorna a última visita do visitante dentro de uma janela de tempo.
 * Usado para last_touch attribution.
 */
export async function findLastVisitorLink(
  productId: string,
  visitorId: string,
  sinceMs: number,
): Promise<TrackingLink | null> {
  const since = new Date(sinceMs)
  const [visitor] = await db
    .select()
    .from(visitors)
    .where(
      and(
        eq(visitors.productId, productId),
        eq(visitors.visitorId, visitorId),
        gt(visitors.lastSeenAt, since),
      ),
    )
    .limit(1)

  if (!visitor?.lastTrackingLinkId) return null

  const [link] = await db
    .select()
    .from(trackingLinks)
    .where(eq(trackingLinks.id, visitor.lastTrackingLinkId))
    .limit(1)
  return link ?? null
}

// --- Growth Events ----------------------------------------------------------

/**
 * Insere um evento. Lança se dedupeKey já existe — o caller deve tratar
 * constraint violation como "já processado" e retornar 202.
 */
export async function insertGrowthEvent(
  row: Omit<typeof growthEvents.$inferInsert, 'id'>,
): Promise<GrowthEvent> {
  const [event] = await db.insert(growthEvents).values(row).returning()
  return event!
}

export async function getPostMetrics(postId: string): Promise<{ clicks: number; signups: number }> {
  const rows = await db
    .select({ eventType: growthEvents.eventType, count: sql<number>`count(*)::int` })
    .from(growthEvents)
    .where(and(eq(growthEvents.postId, postId)))
    .groupBy(growthEvents.eventType)

  const clicks = rows.find((r) => r.eventType === 'click')?.count ?? 0
  const signups = rows.find((r) => r.eventType === 'signup')?.count ?? 0
  return { clicks, signups }
}

export async function getAnalyticsSummary(
  productId: string,
): Promise<{ channel: string; clicks: number; signups: number; conversionRate: number }[]> {
  const rows = await db
    .select({ channel: growthEvents.channel, eventType: growthEvents.eventType, count: sql<number>`count(*)::int` })
    .from(growthEvents)
    .where(eq(growthEvents.productId, productId))
    .groupBy(growthEvents.channel, growthEvents.eventType)

  const byChannel = new Map<string, { clicks: number; signups: number }>()

  for (const row of rows) {
    const ch = row.channel ?? '(direct)'
    const entry = byChannel.get(ch) ?? { clicks: 0, signups: 0 }
    if (row.eventType === 'click') entry.clicks += row.count
    if (row.eventType === 'signup') entry.signups += row.count
    byChannel.set(ch, entry)
  }

  return Array.from(byChannel.entries()).map(([channel, { clicks, signups }]) => ({
    channel,
    clicks,
    signups,
    conversionRate: clicks > 0 ? Math.round((signups / clicks) * 10000) / 100 : 0,
  }))
}

export async function getPostsAnalytics(
  productId: string,
): Promise<{ postId: string; hook: string | null; channel: string; clicks: number; signups: number }[]> {
  const rows = await db
    .select({
      postId: growthEvents.postId,
      channel: growthEvents.channel,
      eventType: growthEvents.eventType,
      count: sql<number>`count(*)::int`,
    })
    .from(growthEvents)
    .where(and(eq(growthEvents.productId, productId), sql`${growthEvents.postId} is not null`))
    .groupBy(growthEvents.postId, growthEvents.channel, growthEvents.eventType)

  const byPost = new Map<string, { channel: string; clicks: number; signups: number }>()
  for (const row of rows) {
    const pid = row.postId!
    const ch = row.channel ?? '(unknown)'
    const entry = byPost.get(pid) ?? { channel: ch, clicks: 0, signups: 0 }
    if (row.eventType === 'click') entry.clicks += row.count
    if (row.eventType === 'signup') entry.signups += row.count
    byPost.set(pid, entry)
  }

  return Array.from(byPost.entries()).map(([postId, data]) => ({
    postId,
    hook: null,
    ...data,
  }))
}

// --- Ingest Keys ------------------------------------------------------------

export async function findIngestKey(keyHash: string): Promise<IngestKey | null> {
  const [key] = await db
    .select()
    .from(ingestKeys)
    .where(and(eq(ingestKeys.keyHash, keyHash), isNull(ingestKeys.revokedAt)))
    .limit(1)
  return key ?? null
}

export async function touchIngestKey(id: string): Promise<void> {
  await db
    .update(ingestKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(ingestKeys.id, id))
}

export async function createIngestKey(params: {
  productId: string
  name: string
}): Promise<{ key: IngestKey; rawKey: string }> {
  const rawKey = 'gik_' + randomBytes(16).toString('hex')
  const keyHash = createHash('sha256').update(rawKey).digest('hex')

  const [key] = await db
    .insert(ingestKeys)
    .values({ productId: params.productId, name: params.name, keyHash })
    .returning()

  return { key: key!, rawKey }
}

export async function revokeIngestKey(id: string, productId: string): Promise<void> {
  await db
    .update(ingestKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(ingestKeys.id, id), eq(ingestKeys.productId, productId)))
}

export async function listIngestKeys(productId: string): Promise<IngestKey[]> {
  return db
    .select()
    .from(ingestKeys)
    .where(eq(ingestKeys.productId, productId))
    .orderBy(desc(ingestKeys.createdAt))
}
