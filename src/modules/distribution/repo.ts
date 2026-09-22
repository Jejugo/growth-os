import { and, desc, eq, gt, lt, inArray, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  systemConfig,
  channelAccounts,
  automationPolicies,
  publications,
  publicationAttempts,
  rateLimitState,
} from './schema'
import type {
  SystemConfig,
  ChannelAccount,
  AutomationPolicy,
  Publication,
  PublicationAttempt,
  RateLimitState,
} from './schema'
import type { PublicationOutcome } from './types'

// --- Config global ------------------------------------------------------

export async function getSystemConfig(): Promise<SystemConfig> {
  const [cfg] = await db.select().from(systemConfig).where(eq(systemConfig.id, 'singleton'))
  if (!cfg) {
    const [created] = await db
      .insert(systemConfig)
      .values({ id: 'singleton', globalKillSwitch: false })
      .onConflictDoNothing()
      .returning()
    return created ?? { id: 'singleton', globalKillSwitch: false, updatedAt: new Date() }
  }
  return cfg
}

export async function setGlobalKillSwitch(value: boolean): Promise<void> {
  await db
    .insert(systemConfig)
    .values({ id: 'singleton', globalKillSwitch: value })
    .onConflictDoUpdate({
      target: systemConfig.id,
      set: { globalKillSwitch: value, updatedAt: sql`now()` },
    })
}

// --- Contas de canal ----------------------------------------------------

export async function insertChannelAccount(row: {
  productId: string
  channel: ChannelAccount['channel']
  handle: string
  displayName?: string | null
  credentials?: string | null
  pageUrl?: string | null
  credentialsExpiresAt?: Date | null
  status?: ChannelAccount['status']
}): Promise<ChannelAccount> {
  const [created] = await db.insert(channelAccounts).values(row).returning()
  return created!
}

export async function listChannelAccounts(productId: string): Promise<ChannelAccount[]> {
  return db
    .select()
    .from(channelAccounts)
    .where(eq(channelAccounts.productId, productId))
    .orderBy(channelAccounts.channel, channelAccounts.createdAt)
}

export async function updateChannelAccount(
  id: string,
  values: Partial<Pick<ChannelAccount, 'handle' | 'displayName' | 'credentials' | 'pageUrl' | 'status'>>,
): Promise<ChannelAccount | undefined> {
  const [updated] = await db
    .update(channelAccounts)
    .set({ ...values, updatedAt: sql`now()` })
    .where(eq(channelAccounts.id, id))
    .returning()
  return updated
}

export async function findChannelAccountByProductChannel(
  productId: string,
  channel: ChannelAccount['channel'],
): Promise<ChannelAccount | undefined> {
  const [found] = await db
    .select()
    .from(channelAccounts)
    .where(and(eq(channelAccounts.productId, productId), eq(channelAccounts.channel, channel)))
    .orderBy(channelAccounts.createdAt)
    .limit(1)
  return found
}

export async function hasAnyChannelAccount(productId: string): Promise<boolean> {
  const rows = await db
    .select({ id: channelAccounts.id })
    .from(channelAccounts)
    .where(eq(channelAccounts.productId, productId))
    .limit(1)
  return rows.length > 0
}

export async function findChannelAccount(id: string): Promise<ChannelAccount | undefined> {
  const [found] = await db.select().from(channelAccounts).where(eq(channelAccounts.id, id)).limit(1)
  return found
}

export async function findChannelAccountByHandle(
  productId: string,
  channel: ChannelAccount['channel'],
  handle: string,
): Promise<ChannelAccount | undefined> {
  const [found] = await db
    .select()
    .from(channelAccounts)
    .where(
      and(
        eq(channelAccounts.productId, productId),
        eq(channelAccounts.channel, channel),
        eq(channelAccounts.handle, handle),
      ),
    )
    .limit(1)
  return found
}

export async function listActiveChannelAccounts(
  productId: string,
  channel?: ChannelAccount['channel'],
): Promise<ChannelAccount[]> {
  return db
    .select()
    .from(channelAccounts)
    .where(
      and(
        eq(channelAccounts.productId, productId),
        eq(channelAccounts.status, 'active'),
        channel ? eq(channelAccounts.channel, channel) : undefined,
      ),
    )
}

export async function setChannelAccountStatus(
  id: string,
  status: ChannelAccount['status'],
  errorMessage?: string | null,
): Promise<void> {
  await db
    .update(channelAccounts)
    .set({
      status,
      lastErrorAt: status === 'error' ? sql`now()` : undefined,
      lastErrorMessage: errorMessage ?? null,
      updatedAt: sql`now()`,
    })
    .where(eq(channelAccounts.id, id))
}

export async function deleteChannelAccount(id: string): Promise<void> {
  await db.delete(channelAccounts).where(eq(channelAccounts.id, id))
}

// --- Políticas de automação ---------------------------------------------

export async function upsertAutomationPolicy(
  productId: string,
  channel: AutomationPolicy['channel'],
  values: Partial<
    Pick<
      AutomationPolicy,
      'level' | 'maxPostsPerDay' | 'minMinutesBetweenPosts' | 'allowedHours' | 'killSwitch'
    >
  >,
): Promise<AutomationPolicy> {
  const [result] = await db
    .insert(automationPolicies)
    .values({ productId, channel, ...values })
    .onConflictDoUpdate({
      target: [automationPolicies.productId, automationPolicies.channel],
      set: { ...values, updatedAt: sql`now()` },
    })
    .returning()
  return result!
}

export async function getAutomationPolicy(
  productId: string,
  channel: AutomationPolicy['channel'],
): Promise<AutomationPolicy | undefined> {
  const [found] = await db
    .select()
    .from(automationPolicies)
    .where(
      and(
        eq(automationPolicies.productId, productId),
        eq(automationPolicies.channel, channel),
      ),
    )
    .limit(1)
  return found
}

export async function listAutomationPolicies(productId: string): Promise<AutomationPolicy[]> {
  return db
    .select()
    .from(automationPolicies)
    .where(eq(automationPolicies.productId, productId))
}

/** Canais que podem receber conteúdo de validação neste produto. */
export async function listValidationChannels(
  productId: string,
): Promise<Array<AutomationPolicy['channel']>> {
  const policies = await listAutomationPolicies(productId)
  return policies
    .filter((policy) => policy.level !== 'suggestions_only' && !policy.killSwitch)
    .map((policy) => policy.channel)
}

// --- Publicações --------------------------------------------------------

export async function insertPublication(row: {
  productId: string
  postId: string
  channelAccountId: string
  idempotencyKey: string
  scheduledFor: Date
  status?: Publication['status']
}): Promise<Publication> {
  const [created] = await db.insert(publications).values(row).returning()
  return created!
}

export async function findPublication(id: string): Promise<Publication | undefined> {
  const [found] = await db.select().from(publications).where(eq(publications.id, id)).limit(1)
  return found
}

export async function confirmAwaitingManualPublication(
  id: string,
  values: { publishedAt: Date; manualConfirmedAt: Date; externalUrl?: string | null },
): Promise<Publication | undefined> {
  const [updated] = await db
    .update(publications)
    .set({
      status: 'published',
      publishedAt: values.publishedAt,
      manualConfirmedAt: values.manualConfirmedAt,
      externalUrl: values.externalUrl ?? null,
      updatedAt: sql`now()`,
    })
    .where(and(eq(publications.id, id), eq(publications.status, 'awaiting_manual')))
    .returning()
  return updated
}

export async function discardAwaitingManualPublication(
  id: string,
): Promise<Publication | undefined> {
  const [updated] = await db
    .update(publications)
    .set({ status: 'cancelled', updatedAt: sql`now()` })
    .where(and(eq(publications.id, id), eq(publications.status, 'awaiting_manual')))
    .returning()
  return updated
}

export async function listAwaitingManualPublications(productId: string): Promise<Publication[]> {
  return db
    .select()
    .from(publications)
    .where(and(eq(publications.productId, productId), eq(publications.status, 'awaiting_manual')))
    .orderBy(publications.createdAt)
}

export async function listExpiredManualPublications(
  cutoff: Date,
): Promise<Publication[]> {
  return db
    .select()
    .from(publications)
    .where(and(eq(publications.status, 'awaiting_manual'), lt(publications.createdAt, cutoff)))
    .orderBy(publications.createdAt)
    .limit(100)
}

export async function expireAwaitingManualPublication(
  id: string,
): Promise<Publication | undefined> {
  const [updated] = await db
    .update(publications)
    .set({
      status: 'cancelled',
      lastError: { reason: 'expired_manual' },
      updatedAt: sql`now()`,
    })
    .where(and(eq(publications.id, id), eq(publications.status, 'awaiting_manual')))
    .returning()
  return updated
}

export async function findPublicationByIdempotencyKey(
  key: string,
): Promise<Publication | undefined> {
  const [found] = await db
    .select()
    .from(publications)
    .where(eq(publications.idempotencyKey, key))
    .limit(1)
  return found
}

export async function listPublications(
  productId: string,
  opts?: { status?: Publication['status']; limit?: number },
): Promise<Publication[]> {
  return db
    .select()
    .from(publications)
    .where(
      and(
        eq(publications.productId, productId),
        opts?.status ? eq(publications.status, opts.status) : undefined,
      ),
    )
    .orderBy(desc(publications.scheduledFor))
    .limit(opts?.limit ?? 50)
}

/**
 * Claim transacional: muda status de 'scheduled' → 'publishing'.
 * Retorna true se o claim foi concedido, false se outra instância já pegou.
 */
export async function claimPublication(id: string): Promise<boolean> {
  const result = await db
    .update(publications)
    .set({ status: 'publishing', updatedAt: sql`now()` })
    .where(and(eq(publications.id, id), eq(publications.status, 'scheduled')))
    .returning({ id: publications.id })
  return result.length > 0
}

export async function resolvePublication(
  id: string,
  outcome: {
    status: Publication['status']
    externalId?: string | null
    externalUrl?: string | null
    publishedAt?: Date | null
    manualConfirmedAt?: Date | null
    lastError?: unknown
  },
): Promise<void> {
  await db
    .update(publications)
    .set({
      status: outcome.status,
      externalId: outcome.externalId ?? null,
      externalUrl: outcome.externalUrl ?? null,
      publishedAt: outcome.publishedAt ?? null,
      manualConfirmedAt: outcome.manualConfirmedAt ?? null,
      lastError: outcome.lastError ? (outcome.lastError as object) : null,
      updatedAt: sql`now()`,
    })
    .where(eq(publications.id, id))
}

export async function incrementPublicationAttempts(id: string): Promise<void> {
  await db
    .update(publications)
    .set({ attemptCount: sql`${publications.attemptCount} + 1`, updatedAt: sql`now()` })
    .where(eq(publications.id, id))
}

export async function reschedulePublication(id: string, scheduledFor: Date): Promise<void> {
  await db
    .update(publications)
    .set({ status: 'scheduled', scheduledFor, updatedAt: sql`now()` })
    .where(eq(publications.id, id))
}

export async function cancelPublication(id: string): Promise<void> {
  await db
    .update(publications)
    .set({ status: 'cancelled', updatedAt: sql`now()` })
    .where(eq(publications.id, id))
}

/**
 * Lista publicações em 'unknown' há mais de minAge minutos.
 */
export async function listUnknownPublications(minAgeMinutes = 2): Promise<Publication[]> {
  const cutoff = new Date(Date.now() - minAgeMinutes * 60 * 1000)
  return db
    .select()
    .from(publications)
    .where(and(eq(publications.status, 'unknown'), lt(publications.updatedAt, cutoff)))
    .orderBy(publications.updatedAt)
    .limit(50)
}

/**
 * Conta publicações bem-sucedidas de uma conta em um intervalo.
 */
export async function countPublishedInWindow(
  channelAccountId: string,
  since: Date,
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(publications)
    .where(
      and(
        eq(publications.channelAccountId, channelAccountId),
        eq(publications.status, 'published'),
        gt(publications.publishedAt, since),
      ),
    )
  return row?.count ?? 0
}

/** Conta a fila manual pendente de um produto e canal, independentemente da conta. */
export async function countAwaitingManualByChannel(
  productId: string,
  channel: ChannelAccount['channel'],
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(publications)
    .innerJoin(channelAccounts, eq(publications.channelAccountId, channelAccounts.id))
    .where(
      and(
        eq(publications.productId, productId),
        eq(channelAccounts.channel, channel),
        eq(publications.status, 'awaiting_manual'),
      ),
    )
  return row?.count ?? 0
}

export async function countManualPendingByProductRepo(): Promise<Record<string, number>> {
  const rows = await db
    .select({ productId: publications.productId, count: sql<number>`count(*)::int` })
    .from(publications)
    .where(eq(publications.status, 'awaiting_manual'))
    .groupBy(publications.productId)
  return Object.fromEntries(rows.map((row) => [row.productId, row.count]))
}

/**
 * Última publicação bem-sucedida de uma conta.
 */
export async function lastPublishedAt(channelAccountId: string): Promise<Date | null> {
  const [row] = await db
    .select({ publishedAt: publications.publishedAt })
    .from(publications)
    .where(
      and(
        eq(publications.channelAccountId, channelAccountId),
        eq(publications.status, 'published'),
      ),
    )
    .orderBy(desc(publications.publishedAt))
    .limit(1)
  return row?.publishedAt ?? null
}

// --- Tentativas ---------------------------------------------------------

export async function insertPublicationAttempt(row: {
  publicationId: string
  attemptNo: number
  request: object
}): Promise<PublicationAttempt> {
  const [created] = await db.insert(publicationAttempts).values(row).returning()
  return created!
}

export async function finishPublicationAttempt(
  id: string,
  outcome: {
    outcome: PublicationOutcome
    responseStatus?: number | null
    response?: object | null
  },
): Promise<void> {
  // Mapeamento: PublicationOutcome → attemptOutcome enum
  const outcomeMap: Record<PublicationOutcome, typeof publicationAttempts.$inferSelect.outcome> = {
    success: 'success',
    retryable: 'retryable_error',
    permanent: 'permanent_error',
    unknown: 'unknown',
  }
  await db
    .update(publicationAttempts)
    .set({
      endedAt: sql`now()`,
      outcome: outcomeMap[outcome.outcome],
      responseStatus: outcome.responseStatus ?? null,
      response: outcome.response ?? null,
    })
    .where(eq(publicationAttempts.id, id))
}

export async function listPublicationAttempts(publicationId: string): Promise<PublicationAttempt[]> {
  return db
    .select()
    .from(publicationAttempts)
    .where(eq(publicationAttempts.publicationId, publicationId))
    .orderBy(publicationAttempts.attemptNo)
}

// --- Rate limit ---------------------------------------------------------

export async function getRateLimitState(channelAccountId: string): Promise<RateLimitState | undefined> {
  const [found] = await db
    .select()
    .from(rateLimitState)
    .where(eq(rateLimitState.channelAccountId, channelAccountId))
    .limit(1)
  return found
}

export async function upsertRateLimitState(
  channelAccountId: string,
  values: Partial<Omit<RateLimitState, 'channelAccountId'>>,
): Promise<void> {
  await db
    .insert(rateLimitState)
    .values({
      channelAccountId,
      windowStartsAt: values.windowStartsAt ?? new Date(),
      requestCount: values.requestCount ?? 1,
      backoffUntil: values.backoffUntil ?? null,
    })
    .onConflictDoUpdate({
      target: rateLimitState.channelAccountId,
      set: { ...values, updatedAt: sql`now()` },
    })
}

export async function incrementRateLimitCount(channelAccountId: string): Promise<void> {
  await db
    .update(rateLimitState)
    .set({
      requestCount: sql`${rateLimitState.requestCount} + 1`,
      updatedAt: sql`now()`,
    })
    .where(eq(rateLimitState.channelAccountId, channelAccountId))
}

export async function setRateLimitBackoff(channelAccountId: string, until: Date): Promise<void> {
  await db
    .update(rateLimitState)
    .set({ backoffUntil: until, updatedAt: sql`now()` })
    .where(eq(rateLimitState.channelAccountId, channelAccountId))
}
