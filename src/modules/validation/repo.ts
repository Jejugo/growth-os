import { and, desc, eq, gte, lte, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { productBriefs, validations, productStageEvents, landingPages, landingPageDrafts, waitlistSignups } from './schema'
import type { ProductBrief, Validation, ProductStageEvent, LandingPage, LandingPageDraft, WaitlistSignup } from './schema'
import type { LandingPageCopy, CustomLandingFile, CustomLandingDraftHistoryEntry } from './landing/types'
import type { ProductStage } from '@/modules/products/schema'
import type { ValidationVerdict } from './gate'
import type { RiskReview } from '@/modules/content/types'

// --- Briefs -------------------------------------------------------------

export async function insertBrief(row: {
  productId: string
  problem: string
  audience: string
  solutionSketch: string
  whyNow?: string | null
  alternatives?: string | null
  riskiestAssumption: string
}): Promise<ProductBrief> {
  const [created] = await db.insert(productBriefs).values(row).returning()
  return created!
}

export async function findBriefById(id: string): Promise<ProductBrief | undefined> {
  const [found] = await db.select().from(productBriefs).where(eq(productBriefs.id, id)).limit(1)
  return found
}

export async function findLatestBrief(productId: string): Promise<ProductBrief | undefined> {
  const [found] = await db
    .select()
    .from(productBriefs)
    .where(eq(productBriefs.productId, productId))
    .orderBy(desc(productBriefs.createdAt))
    .limit(1)
  return found
}

// --- Validações -----------------------------------------------------------

export interface NewValidationRow {
  productId: string
  briefId: string
  campaignId?: string | null
  contentThemeId?: string | null
  experimentId?: string | null
  hypothesis: string
  landingUrl: string
  minVisitors: number
  minSignups: number
  minSignupRate: string
  minStrongSignals: number
  endsAt: Date
}

export async function insertValidation(row: NewValidationRow): Promise<Validation> {
  const [created] = await db
    .insert(validations)
    .values({ ...row, status: 'running', startedAt: sql`now()` })
    .returning()
  return created!
}

export async function findValidation(id: string): Promise<Validation | undefined> {
  const [found] = await db.select().from(validations).where(eq(validations.id, id)).limit(1)
  return found
}

export async function findRunningValidation(productId: string): Promise<Validation | undefined> {
  const [found] = await db
    .select()
    .from(validations)
    .where(and(eq(validations.productId, productId), eq(validations.status, 'running')))
    .orderBy(desc(validations.createdAt))
    .limit(1)
  return found
}

export async function findValidationByCampaignId(campaignId: string): Promise<Validation | undefined> {
  const [found] = await db
    .select()
    .from(validations)
    .where(eq(validations.campaignId, campaignId))
    .limit(1)
  return found
}

export async function listValidations(productId: string): Promise<Validation[]> {
  return db
    .select()
    .from(validations)
    .where(eq(validations.productId, productId))
    .orderBy(desc(validations.createdAt))
}

/** Validações vencidas (endsAt no passado) ainda em `running` — para o cron diário. */
export async function findDueValidations(now: Date): Promise<Validation[]> {
  return db
    .select()
    .from(validations)
    .where(and(eq(validations.status, 'running'), lte(validations.endsAt, now)))
}

export async function concludeValidation(
  id: string,
  patch: {
    verdict: ValidationVerdict
    verdictReason: string
    pivotSuggestions: string[]
    aiCallId?: string | null
  },
): Promise<void> {
  await db
    .update(validations)
    .set({
      status: 'concluded',
      verdict: patch.verdict,
      verdictReason: patch.verdictReason,
      pivotSuggestions: patch.pivotSuggestions,
      verdictAt: sql`now()`,
      aiCallId: patch.aiCallId ?? null,
      updatedAt: sql`now()`,
    })
    .where(eq(validations.id, id))
}

export async function abortValidation(id: string): Promise<void> {
  await db
    .update(validations)
    .set({ status: 'aborted', updatedAt: sql`now()` })
    .where(eq(validations.id, id))
}

// --- Métricas do gate (SQL determinístico sobre growth_events) -------------

export interface ValidationMetricsRow {
  visitors: number
  signups: number
  activations: number
  paid: number
}

export async function getValidationMetrics(
  productId: string,
  windowStart: Date,
  windowEnd: Date,
): Promise<ValidationMetricsRow> {
  // postgres.js não serializa `Date` sozinho num `db.execute` cru — precisa
  // do ISO string explícito (ao contrário da API tipada do Drizzle).
  const [row] = await db.execute<{
    visitors: number
    signups: number
    activations: number
    paid: number
  }>(sql`
    SELECT
      COUNT(DISTINCT visitor_id) FILTER (WHERE visitor_id IS NOT NULL)::int AS visitors,
      COUNT(*) FILTER (WHERE event_type = 'signup')::int AS signups,
      COUNT(*) FILTER (WHERE event_type = 'activation')::int AS activations,
      COUNT(*) FILTER (WHERE event_type = 'paid')::int AS paid
    FROM growth_events
    WHERE product_id = ${productId}
      AND occurred_at >= ${windowStart.toISOString()}
      AND occurred_at <= ${windowEnd.toISOString()}
  `)

  return row ?? { visitors: 0, signups: 0, activations: 0, paid: 0 }
}

// --- Desempenho por variante (ângulo) --------------------------------------

export interface VariantPerformanceRow {
  variantId: string
  clicks: number
  signups: number
  activations: number
  paid: number
}

/** Junta growth_events → social_posts (variantOf) → experiment_variants. */
export async function getVariantPerformance(experimentId: string): Promise<VariantPerformanceRow[]> {
  const rows = await db.execute<{
    variant_id: string
    clicks: number
    signups: number
    activations: number
    paid: number
  }>(sql`
    SELECT
      ev.id AS variant_id,
      COUNT(*) FILTER (WHERE ge.event_type = 'click')::int AS clicks,
      COUNT(*) FILTER (WHERE ge.event_type = 'signup')::int AS signups,
      COUNT(*) FILTER (WHERE ge.event_type = 'activation')::int AS activations,
      COUNT(*) FILTER (WHERE ge.event_type = 'paid')::int AS paid
    FROM experiment_variants ev
    LEFT JOIN social_posts sp ON sp.variant_of = ev.id
    LEFT JOIN growth_events ge ON ge.post_id = sp.id
    WHERE ev.experiment_id = ${experimentId}
    GROUP BY ev.id
  `)

  return Array.from(rows).map((r) => ({
    variantId: r.variant_id,
    clicks: r.clicks,
    signups: r.signups,
    activations: r.activations,
    paid: r.paid,
  }))
}

// --- Landing page automática -------------------------------------------------

export async function insertLandingPage(row: {
  productId: string
  slug: string
  source?: LandingPage['source']
}): Promise<LandingPage> {
  const [created] = await db.insert(landingPages).values(row).returning()
  return created!
}

export async function updateLandingPage(
  id: string,
  fields: Partial<{
    status: LandingPage['status']
    copy: LandingPageCopy
    html: string
    files: CustomLandingFile[]
    riskReview: RiskReview
    vercelProjectId: string
    vercelDeploymentId: string
    deployUrl: string
    aiCallId: string
    error: string | null
  }>,
): Promise<void> {
  await db
    .update(landingPages)
    .set({ ...fields, updatedAt: sql`now()` })
    .where(eq(landingPages.id, id))
}

export async function findLandingPage(id: string): Promise<LandingPage | undefined> {
  const [found] = await db.select().from(landingPages).where(eq(landingPages.id, id)).limit(1)
  return found
}

/** Tentativa de geração mais recente do produto — a que a UI mostra. */
export async function findLatestLandingPage(productId: string): Promise<LandingPage | undefined> {
  const [found] = await db
    .select()
    .from(landingPages)
    .where(eq(landingPages.productId, productId))
    .orderBy(desc(landingPages.createdAt))
    .limit(1)
  return found
}

/**
 * Última tentativa que de fato publicou algo (`ready` sempre tem `copy` ou `files` preenchido,
 * dependendo da origem). Usada como base pra "pedir ajustes" — `findLatestLandingPage` devolveria
 * uma tentativa `failed` mais recente sem conteúdo nenhum pra revisar, deixando o usuário sem como
 * tentar de novo depois de uma falha.
 */
export async function findLatestReadyLandingPage(productId: string): Promise<LandingPage | undefined> {
  const [found] = await db
    .select()
    .from(landingPages)
    .where(and(eq(landingPages.productId, productId), eq(landingPages.status, 'ready')))
    .orderBy(desc(landingPages.createdAt))
    .limit(1)
  return found
}

export async function findGeneratingLandingPage(productId: string): Promise<LandingPage | undefined> {
  const [found] = await db
    .select()
    .from(landingPages)
    .where(and(eq(landingPages.productId, productId), eq(landingPages.status, 'generating')))
    .orderBy(desc(landingPages.createdAt))
    .limit(1)
  return found
}

// --- Rascunho de landing customizada -----------------------------------------

export async function findLandingPageDraft(productId: string): Promise<LandingPageDraft | undefined> {
  const [found] = await db.select().from(landingPageDrafts).where(eq(landingPageDrafts.productId, productId)).limit(1)
  return found
}

/** Um por produto — reenviar um zip novo substitui o rascunho (e o histórico) inteiro. */
export async function upsertLandingPageDraft(
  productId: string,
  fields: { files: CustomLandingFile[]; history: CustomLandingDraftHistoryEntry[] },
): Promise<LandingPageDraft> {
  const [row] = await db
    .insert(landingPageDrafts)
    .values({ productId, ...fields })
    .onConflictDoUpdate({
      target: landingPageDrafts.productId,
      set: { ...fields, updatedAt: sql`now()` },
    })
    .returning()
  return row!
}

// --- Waitlist ----------------------------------------------------------------

/** Idempotente por (productId, email) — reenvio do form não duplica nem falha. */
export async function insertWaitlistSignup(row: {
  productId: string
  email: string
  visitorId?: string | null
}): Promise<void> {
  await db
    .insert(waitlistSignups)
    .values(row)
    .onConflictDoNothing({ target: [waitlistSignups.productId, waitlistSignups.email] })
}

export async function listWaitlistSignups(
  productId: string,
  opts?: { since?: Date; until?: Date },
): Promise<WaitlistSignup[]> {
  const conditions = [eq(waitlistSignups.productId, productId)]
  if (opts?.since) conditions.push(gte(waitlistSignups.createdAt, opts.since))
  if (opts?.until) conditions.push(lte(waitlistSignups.createdAt, opts.until))

  return db
    .select()
    .from(waitlistSignups)
    .where(and(...conditions))
    .orderBy(desc(waitlistSignups.createdAt))
}

// --- Histórico de estágio ---------------------------------------------------

export async function insertStageEvent(row: {
  productId: string
  fromStage: ProductStage | null
  toStage: ProductStage
  actor: 'human' | 'system'
  reason?: string | null
  validationId?: string | null
}): Promise<ProductStageEvent> {
  const [created] = await db.insert(productStageEvents).values(row).returning()
  return created!
}

export async function listStageEvents(productId: string): Promise<ProductStageEvent[]> {
  return db
    .select()
    .from(productStageEvents)
    .where(eq(productStageEvents.productId, productId))
    .orderBy(productStageEvents.occurredAt)
}
