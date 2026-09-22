import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { isSampleSufficient } from './confidence'
import { performanceRollups } from './schema'
import type { PerformanceRollup } from './schema'

// Janelas de tempo que computamos
const WINDOWS = [
  { kind: '7d' as const, daysBack: 7 },
  { kind: '28d' as const, daysBack: 28 },
  { kind: 'all' as const, daysBack: null },
] as const

/**
 * Recalcula todos os rollups de um produto para todas as dimensões e janelas.
 * Idempotente: usa UPSERT na constraint única.
 */
export async function computeRollups(productId: string): Promise<void> {
  const now = new Date()

  for (const win of WINDOWS) {
    const windowEnd = now
    const windowStart = win.daysBack
      ? new Date(now.getTime() - win.daysBack * 86_400_000)
      : new Date(0)

    await computeChannelRollup(productId, win.kind, windowStart, windowEnd)
    await computeAngleRollup(productId, win.kind, windowStart, windowEnd)
    await computeCampaignRollup(productId, win.kind, windowStart, windowEnd)
    await computeHourRollup(productId, win.kind, windowStart, windowEnd)
  }
}

// --- Rollup por canal -------------------------------------------------------

async function computeChannelRollup(
  productId: string,
  kind: PerformanceRollup['windowKind'],
  windowStart: Date,
  windowEnd: Date,
): Promise<void> {
  const rows = await db.execute<{
    dimension_value: string
    posts: number
    clicks: number
    signups: number
    activations: number
    paid: number
    revenue: string
  }>(sql`
    SELECT
      COALESCE(ge.channel, '(direct)') AS dimension_value,
      COUNT(DISTINCT ge.post_id)::int AS posts,
      SUM(CASE WHEN ge.event_type = 'click' THEN 1 ELSE 0 END)::int AS clicks,
      SUM(CASE WHEN ge.event_type = 'signup' THEN 1 ELSE 0 END)::int AS signups,
      SUM(CASE WHEN ge.event_type = 'activation' THEN 1 ELSE 0 END)::int AS activations,
      SUM(CASE WHEN ge.event_type = 'paid' THEN 1 ELSE 0 END)::int AS paid,
      COALESCE(SUM(CASE WHEN ge.event_type = 'paid' THEN ge.value::numeric ELSE 0 END), 0) AS revenue
    FROM growth_events ge
    WHERE ge.product_id = ${productId}
      AND ge.occurred_at >= ${windowStart.toISOString()}
      AND ge.occurred_at <= ${windowEnd.toISOString()}
    GROUP BY 1
  `)

  await upsertRollups(Array.from(rows), 'channel', productId, kind, windowStart, windowEnd)
}

// --- Rollup por ângulo de conteúdo -----------------------------------------

async function computeAngleRollup(
  productId: string,
  kind: PerformanceRollup['windowKind'],
  windowStart: Date,
  windowEnd: Date,
): Promise<void> {
  const rows = await db.execute<{
    dimension_value: string
    posts: number
    clicks: number
    signups: number
    activations: number
    paid: number
    revenue: string
  }>(sql`
    SELECT
      ci.angle AS dimension_value,
      COUNT(DISTINCT ge.post_id)::int AS posts,
      SUM(CASE WHEN ge.event_type = 'click' THEN 1 ELSE 0 END)::int AS clicks,
      SUM(CASE WHEN ge.event_type = 'signup' THEN 1 ELSE 0 END)::int AS signups,
      SUM(CASE WHEN ge.event_type = 'activation' THEN 1 ELSE 0 END)::int AS activations,
      SUM(CASE WHEN ge.event_type = 'paid' THEN 1 ELSE 0 END)::int AS paid,
      COALESCE(SUM(CASE WHEN ge.event_type = 'paid' THEN ge.value::numeric ELSE 0 END), 0) AS revenue
    FROM growth_events ge
    JOIN social_posts sp ON sp.id = ge.post_id
    JOIN content_ideas ci ON ci.id = sp.idea_id
    WHERE ge.product_id = ${productId}
      AND ge.occurred_at >= ${windowStart.toISOString()}
      AND ge.occurred_at <= ${windowEnd.toISOString()}
      AND ge.post_id IS NOT NULL
      AND ci.angle IS NOT NULL
    GROUP BY 1
  `)

  await upsertRollups(Array.from(rows), 'angle', productId, kind, windowStart, windowEnd)
}

// --- Rollup por campanha ----------------------------------------------------

async function computeCampaignRollup(
  productId: string,
  kind: PerformanceRollup['windowKind'],
  windowStart: Date,
  windowEnd: Date,
): Promise<void> {
  const rows = await db.execute<{
    dimension_value: string
    posts: number
    clicks: number
    signups: number
    activations: number
    paid: number
    revenue: string
  }>(sql`
    SELECT
      COALESCE(ge.campaign_id, '(sem campanha)') AS dimension_value,
      COUNT(DISTINCT ge.post_id)::int AS posts,
      SUM(CASE WHEN ge.event_type = 'click' THEN 1 ELSE 0 END)::int AS clicks,
      SUM(CASE WHEN ge.event_type = 'signup' THEN 1 ELSE 0 END)::int AS signups,
      SUM(CASE WHEN ge.event_type = 'activation' THEN 1 ELSE 0 END)::int AS activations,
      SUM(CASE WHEN ge.event_type = 'paid' THEN 1 ELSE 0 END)::int AS paid,
      COALESCE(SUM(CASE WHEN ge.event_type = 'paid' THEN ge.value::numeric ELSE 0 END), 0) AS revenue
    FROM growth_events ge
    WHERE ge.product_id = ${productId}
      AND ge.occurred_at >= ${windowStart.toISOString()}
      AND ge.occurred_at <= ${windowEnd.toISOString()}
    GROUP BY 1
  `)

  await upsertRollups(Array.from(rows), 'campaign', productId, kind, windowStart, windowEnd)
}

// --- Rollup por hora de publicação -----------------------------------------

async function computeHourRollup(
  productId: string,
  kind: PerformanceRollup['windowKind'],
  windowStart: Date,
  windowEnd: Date,
): Promise<void> {
  const rows = await db.execute<{
    dimension_value: string
    posts: number
    clicks: number
    signups: number
    activations: number
    paid: number
    revenue: string
  }>(sql`
    SELECT
      EXTRACT(HOUR FROM ge.occurred_at)::text AS dimension_value,
      COUNT(DISTINCT ge.post_id)::int AS posts,
      SUM(CASE WHEN ge.event_type = 'click' THEN 1 ELSE 0 END)::int AS clicks,
      SUM(CASE WHEN ge.event_type = 'signup' THEN 1 ELSE 0 END)::int AS signups,
      SUM(CASE WHEN ge.event_type = 'activation' THEN 1 ELSE 0 END)::int AS activations,
      SUM(CASE WHEN ge.event_type = 'paid' THEN 1 ELSE 0 END)::int AS paid,
      COALESCE(SUM(CASE WHEN ge.event_type = 'paid' THEN ge.value::numeric ELSE 0 END), 0) AS revenue
    FROM growth_events ge
    WHERE ge.product_id = ${productId}
      AND ge.occurred_at >= ${windowStart.toISOString()}
      AND ge.occurred_at <= ${windowEnd.toISOString()}
    GROUP BY 1
  `)

  await upsertRollups(Array.from(rows), 'posting_hour', productId, kind, windowStart, windowEnd)
}

// --- Upsert helper ----------------------------------------------------------

async function upsertRollups(
  rows: Array<{
    dimension_value: string
    posts: number
    clicks: number
    signups: number
    activations: number
    paid: number
    revenue: string
  }>,
  dimension: PerformanceRollup['dimension'],
  productId: string,
  windowKind: PerformanceRollup['windowKind'],
  windowStart: Date,
  windowEnd: Date,
): Promise<void> {
  if (rows.length === 0) return

  const now = new Date()

  for (const row of rows) {
    const clicks = row.clicks ?? 0
    const signups = row.signups ?? 0
    const paid = row.paid ?? 0
    const posts = row.posts ?? 0
    const clickRate = posts > 0 ? clicks / posts : 0
    const signupRate = clicks > 0 ? signups / clicks : 0
    const paidRate = signups > 0 ? paid / signups : 0

    const partial = {
      posts,
      clicks,
      signups,
      activations: row.activations ?? 0,
      paid,
      windowKind,
    }

    const sufficient = isSampleSufficient(partial)

    await db
      .insert(performanceRollups)
      .values({
        productId,
        dimension,
        dimensionValue: row.dimension_value,
        windowStart,
        windowEnd,
        windowKind,
        posts,
        // Impressões nativas ainda não são coletadas. Zero significa "não coletado", não ausência
        // de alcance; nenhum cálculo de decisão deve tratar este valor como uma métrica observada.
        impressions: 0,
        clicks,
        signups,
        activations: row.activations ?? 0,
        paid,
        revenue: row.revenue ?? '0',
        clickRate: clickRate.toFixed(4),
        signupRate: signupRate.toFixed(4),
        paidRate: paidRate.toFixed(4),
        sampleSufficient: sufficient,
        computedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          performanceRollups.productId,
          performanceRollups.dimension,
          performanceRollups.dimensionValue,
          performanceRollups.windowKind,
          performanceRollups.windowEnd,
        ],
        set: {
          posts,
          clicks,
          signups,
          activations: row.activations ?? 0,
          paid,
          revenue: row.revenue ?? '0',
          clickRate: clickRate.toFixed(4),
          signupRate: signupRate.toFixed(4),
          paidRate: paidRate.toFixed(4),
          sampleSufficient: sufficient,
          computedAt: now,
        },
      })
  }
}
