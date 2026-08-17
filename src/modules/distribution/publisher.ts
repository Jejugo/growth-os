import { createHash } from 'crypto'
import { recordDecision } from '@/lib/observability/service'
import { findPost } from '@/modules/content/repo'
import { getChannel } from './channels/registry'
import {
  findPublication,
  findChannelAccount,
  getAutomationPolicy,
  claimPublication,
  resolvePublication,
  reschedulePublication,
  incrementPublicationAttempts,
  insertPublicationAttempt,
  finishPublicationAttempt,
} from './repo'
import {
  assertKillSwitchOff,
  assertRateLimitOk,
  assertMinInterval,
  registerRateLimitHit,
  recordSuccessfulRequest,
  isWithinAllowedHours,
  KillSwitchError,
  RateLimitError,
  DailyLimitError,
} from './service'
import { applyUtm } from './utm'
import type { RenderedContent } from './types'

export class ProductMismatchError extends Error {
  constructor() {
    super('productId do post não corresponde ao productId da conta de canal.')
    this.name = 'ProductMismatchError'
  }
}

export class PostNotApprovedError extends Error {
  constructor(public readonly status: string) {
    super(`Post não está aprovado (status: ${status}).`)
    this.name = 'PostNotApprovedError'
  }
}

export class ValidationFailedError extends Error {
  constructor(public readonly errors: string[]) {
    super(`Conteúdo inválido para o canal: ${errors.join('; ')}`)
    this.name = 'ValidationFailedError'
  }
}

/**
 * Gera a chave de idempotência para uma publicação.
 * sha256(postId + channelAccountId + scheduledFor.toISOString())
 */
export function buildIdempotencyKey(
  postId: string,
  channelAccountId: string,
  scheduledFor: Date,
): string {
  return createHash('sha256')
    .update(`${postId}:${channelAccountId}:${scheduledFor.toISOString()}`)
    .digest('hex')
}

/**
 * Renderiza o conteúdo de um post para um canal.
 * Aplica UTMs no linkUrl se presente.
 */
const CHANNEL_GRAPHEME_LIMITS: Record<string, number> = {
  bluesky: 300,
  linkedin: 3000,
  reddit: 10000,
}

function countGraphemes(text: string): number {
  try {
    return [...new Intl.Segmenter().segment(text)].length
  } catch {
    return text.length
  }
}

/**
 * Para canais com limite apertado (Bluesky: 300 grafemas), monta o texto
 * progressivamente: hook → hook+body → hook+body+cta, parando antes de
 * ultrapassar o limite. Nunca trunca no meio de uma palavra.
 */
function buildText(
  hook: string,
  body: string,
  cta: string | null,
  maxGraphemes: number,
): string {
  const hookText = hook.trim()
  if (countGraphemes(hookText) >= maxGraphemes) {
    return hookText
  }

  const withBody = body ? `${hookText}\n\n${body.trim()}` : hookText
  if (countGraphemes(withBody) > maxGraphemes) {
    return hookText
  }

  if (!cta) return withBody

  const withCta = `${withBody}\n\n${cta.trim()}`
  if (countGraphemes(withCta) > maxGraphemes) {
    return withBody
  }

  return withCta
}

function renderContent(
  post: { hook: string; body: string; cta: string | null; linkUrl: string | null; channel: string },
  campaignId: string,
  postId: string,
  channel: string,
): RenderedContent {
  const maxGraphemes = CHANNEL_GRAPHEME_LIMITS[channel] ?? 3000
  const text = buildText(post.hook, post.body, post.cta, maxGraphemes)

  let linkUrl = post.linkUrl ?? undefined
  if (linkUrl) {
    linkUrl = applyUtm(linkUrl, { channel, campaignId, postId })
  }

  const graphemeCount = (() => {
    try {
      return [...new Intl.Segmenter().segment(text)].length
    } catch {
      return text.length
    }
  })()

  return { text, linkUrl, graphemeCount }
}

/**
 * Motor de publicação — sequência de 11 passos.
 * Retorna o status final da publicação.
 */
export async function runPublisher(publicationId: string): Promise<{
  status: 'published' | 'failed' | 'unknown' | 'cancelled'
  externalUrl?: string
  reason?: string
}> {
  // Passo 1: carrega publicação; exige status 'scheduled'
  const publication = await findPublication(publicationId)
  if (!publication) throw new Error(`Publicação ${publicationId} não encontrada.`)
  if (publication.status !== 'scheduled') {
    return {
      status: publication.status as 'published' | 'failed' | 'unknown' | 'cancelled',
      reason: `Publicação não está em 'scheduled' (status: ${publication.status}).`,
    }
  }

  const account = await findChannelAccount(publication.channelAccountId)
  if (!account) throw new Error(`Conta de canal ${publication.channelAccountId} não encontrada.`)

  const policy = await getAutomationPolicy(publication.productId, account.channel)

  // Passo 2: re-checa kill switch (imediatamente antes de publicar)
  try {
    await assertKillSwitchOff(publication.productId, account.channel)
  } catch (err) {
    if (err instanceof KillSwitchError) {
      await resolvePublication(publicationId, { status: 'cancelled', lastError: { reason: err.message } })
      await recordDecision({
        productId: publication.productId,
        actor: 'publisher',
        decision: 'NO_ACTION',
        rationale: `Kill switch ativo (${err.level}) — publicação ${publicationId} cancelada.`,
      })
      return { status: 'cancelled', reason: err.message }
    }
    throw err
  }

  // Passo 3: re-checa política de automação e limites de frequência
  if (policy) {
    try {
      await assertRateLimitOk(account, policy)
      await assertMinInterval(account, policy)
    } catch (err) {
      if (err instanceof RateLimitError || err instanceof DailyLimitError) {
        // Reagenda — não cancela
        const retryAt = err instanceof RateLimitError ? err.backoffUntil : new Date(Date.now() + 60 * 60 * 1000)
        await reschedulePublication(publicationId, retryAt)
        await recordDecision({
          productId: publication.productId,
          actor: 'publisher',
          decision: 'NO_ACTION',
          rationale: `Rate limit/limite diário — publicação ${publicationId} reagendada para ${retryAt.toISOString()}.`,
        })
        return { status: 'failed', reason: err.message }
      }
      throw err
    }
  }

  // Passo 4: guarda de produto — post.productId deve corresponder a account.productId
  const post = await findPost(publication.postId)
  if (!post) throw new Error(`Post ${publication.postId} não encontrado.`)

  if (post.productId !== account.productId) {
    await resolvePublication(publicationId, {
      status: 'failed',
      lastError: { reason: 'ProductMismatch' },
    })
    throw new ProductMismatchError()
  }

  // Passo 5: re-checa que o post ainda está 'approved'
  if (post.status !== 'approved') {
    await resolvePublication(publicationId, {
      status: 'cancelled',
      lastError: { reason: `Post status: ${post.status}` },
    })
    return { status: 'cancelled', reason: `Post não está aprovado (${post.status}).` }
  }

  // Passo 6: renderiza conteúdo + valida
  const adapter = getChannel(account.channel)
  const content = renderContent(
    { ...post, channel: account.channel },
    post.campaignId,
    post.id,
    account.channel,
  )
  const validation = adapter.validate(content)

  if (!validation.valid) {
    await resolvePublication(publicationId, {
      status: 'failed',
      lastError: { errors: validation.errors },
    })
    throw new ValidationFailedError(validation.errors)
  }

  // Passo 7: claim transacional — muda scheduled → publishing
  const claimed = await claimPublication(publicationId)
  if (!claimed) {
    return {
      status: publication.status as 'published' | 'failed' | 'unknown' | 'cancelled',
      reason: 'Publicação já foi reivindicada por outro worker.',
    }
  }

  // Passo 8: registra tentativa
  await incrementPublicationAttempts(publicationId)
  const attempt = await insertPublicationAttempt({
    publicationId,
    attemptNo: publication.attemptCount + 1,
    request: {
      channel: account.channel,
      handle: account.handle,
      textLength: content.text.length,
      graphemeCount: content.graphemeCount,
      hasLink: !!content.linkUrl,
    },
  })

  // Passo 9: chama o adapter
  const result = await adapter.publish(content, {
    publicationId,
    idempotencyKey: publication.idempotencyKey,
    account,
  })

  // Passo 10: mapeia resultado
  await finishPublicationAttempt(attempt.id, {
    outcome: result.outcome,
    responseStatus: result.responseStatus ?? null,
    response: result.error ? { error: result.error } : null,
  })

  if (result.outcome === 'success') {
    await resolvePublication(publicationId, {
      status: 'published',
      externalId: result.externalId ?? null,
      externalUrl: result.externalUrl ?? null,
      publishedAt: new Date(),
    })
    await recordSuccessfulRequest(account.id)
    await recordDecision({
      productId: publication.productId,
      actor: 'publisher',
      decision: 'PUBLISH',
      rationale: `Post ${post.id} publicado no ${account.channel} (${account.handle}). URL: ${result.externalUrl ?? 'N/A'}.`,
    })
    return { status: 'published', externalUrl: result.externalUrl }
  }

  if (result.outcome === 'permanent') {
    await resolvePublication(publicationId, {
      status: 'failed',
      lastError: { error: result.error, responseStatus: result.responseStatus },
    })
    return { status: 'failed', reason: result.error }
  }

  if (result.outcome === 'retryable') {
    // 429 → backoff + reagenda
    if (result.responseStatus === 429) {
      await registerRateLimitHit(account.id)
    }
    const retryAt = new Date(Date.now() + 5 * 60 * 1000) // 5 min
    await reschedulePublication(publicationId, retryAt)
    return { status: 'failed', reason: result.error }
  }

  // outcome === 'unknown' — timeout ou 5xx — NÃO faz retry, enfileira reconciliação
  await resolvePublication(publicationId, {
    status: 'unknown',
    lastError: { error: result.error, responseStatus: result.responseStatus },
  })
  await recordDecision({
    productId: publication.productId,
    actor: 'publisher',
    decision: 'NO_ACTION',
    rationale: `Publicação ${publicationId} em status 'unknown' após ${result.error}. Aguardando reconciliação.`,
  })

  // Passo 11: log de auditoria (já feito via recordDecision acima)
  return { status: 'unknown', reason: result.error }
}
