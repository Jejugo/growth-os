import {
  getSystemConfig,
  getAutomationPolicy,
  getRateLimitState,
  upsertRateLimitState,
  incrementRateLimitCount,
  setRateLimitBackoff,
  countPublishedInWindow,
  lastPublishedAt,
} from './repo'
import type { ChannelAccount, AutomationPolicy } from './schema'

// --- Kill switch --------------------------------------------------------

export class KillSwitchError extends Error {
  constructor(public readonly level: 'global' | 'channel') {
    super(`Kill switch ativado no nível: ${level}`)
    this.name = 'KillSwitchError'
  }
}

/**
 * Verifica kill switch em dois níveis: global → canal.
 * Lança KillSwitchError se qualquer nível estiver ativo.
 */
export async function assertKillSwitchOff(
  productId: string,
  channel: ChannelAccount['channel'],
): Promise<void> {
  const config = await getSystemConfig()
  if (config.globalKillSwitch) {
    throw new KillSwitchError('global')
  }

  const policy = await getAutomationPolicy(productId, channel)
  if (policy?.killSwitch) {
    throw new KillSwitchError('channel')
  }
}

// --- Janela de horário --------------------------------------------------

/**
 * Verifica se o momento atual está dentro das janelas permitidas pela política.
 * Se allowedHours for null, qualquer horário é permitido.
 *
 * allowedHours: { "mon": [[9, 18]], "tue": [[9, 12], [14, 18]], ... }
 * onde os valores são [horaInicio, horaFim] em UTC.
 */
export function isWithinAllowedHours(policy: AutomationPolicy, now = new Date()): boolean {
  if (!policy.allowedHours) return true

  const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
  const dayKey = days[now.getUTCDay()]!
  const hour = now.getUTCHours()

  const windows = (policy.allowedHours as Record<string, [number, number][]>)[dayKey]
  if (!windows || windows.length === 0) return false

  return windows.some(([start, end]) => hour >= start && hour < end)
}

// --- Rate limit ---------------------------------------------------------

export class RateLimitError extends Error {
  constructor(public readonly backoffUntil: Date) {
    super(`Rate limit ativo até ${backoffUntil.toISOString()}`)
    this.name = 'RateLimitError'
  }
}

export class DailyLimitError extends Error {
  constructor(public readonly max: number) {
    super(`Limite diário de ${max} publicações atingido.`)
    this.name = 'DailyLimitError'
  }
}

/**
 * Verifica se a conta está em backoff ou atingiu o limite diário.
 * Lança RateLimitError ou DailyLimitError se necessário.
 */
export async function assertRateLimitOk(
  account: ChannelAccount,
  policy: AutomationPolicy,
): Promise<void> {
  const state = await getRateLimitState(account.id)

  if (state?.backoffUntil && state.backoffUntil > new Date()) {
    throw new RateLimitError(state.backoffUntil)
  }

  const startOfDay = new Date()
  startOfDay.setUTCHours(0, 0, 0, 0)

  const countToday = await countPublishedInWindow(account.id, startOfDay)
  if (countToday >= policy.maxPostsPerDay) {
    throw new DailyLimitError(policy.maxPostsPerDay)
  }
}

/**
 * Verifica se passou o tempo mínimo desde a última publicação.
 */
export async function assertMinInterval(
  account: ChannelAccount,
  policy: AutomationPolicy,
): Promise<void> {
  const lastAt = await lastPublishedAt(account.id)
  if (!lastAt) return

  const minMs = policy.minMinutesBetweenPosts * 60 * 1000
  const elapsed = Date.now() - lastAt.getTime()

  if (elapsed < minMs) {
    const waitMs = minMs - elapsed
    const nextAt = new Date(Date.now() + waitMs)
    throw new RateLimitError(nextAt)
  }
}

/**
 * Registra um 429 recebido: aplica backoff exponencial na conta.
 */
export async function registerRateLimitHit(
  accountId: string,
  retryAfterSeconds?: number,
): Promise<void> {
  const backoffMs = retryAfterSeconds
    ? retryAfterSeconds * 1000
    : 15 * 60 * 1000 // padrão: 15 minutos

  await setRateLimitBackoff(accountId, new Date(Date.now() + backoffMs))
}

/**
 * Registra uma publicação bem-sucedida no contador de rate limit.
 */
export async function recordSuccessfulRequest(accountId: string): Promise<void> {
  const state = await getRateLimitState(accountId)
  const now = new Date()

  const windowStart = new Date(now)
  windowStart.setUTCHours(0, 0, 0, 0)

  if (!state || state.windowStartsAt < windowStart) {
    // Nova janela (dia)
    await upsertRateLimitState(accountId, {
      windowStartsAt: windowStart,
      requestCount: 1,
      backoffUntil: null,
    })
  } else {
    await incrementRateLimitCount(accountId)
  }
}
