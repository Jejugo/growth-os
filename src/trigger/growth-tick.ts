import { task, schedules, logger } from '@trigger.dev/sdk'
import { recordDecision } from '@/lib/observability/service'
import { findProduct, findProductIdsByStage } from '@/modules/products'
import { listPosts, setPostStatus } from '@/modules/content/repo'
import {
  getSystemConfig,
  getAutomationPolicy,
  listActiveChannelAccounts,
  insertPublication,
  findPublicationByIdempotencyKey,
  countAwaitingManualByChannel,
  resolvePublication,
} from '@/modules/distribution/repo'
import { buildIdempotencyKey } from '@/modules/distribution/publisher'
import { renderPublicationContent } from '@/modules/distribution/render'
import { getChannel, isManualChannel } from '@/modules/distribution/channels/registry'
import {
  isWithinAllowedHours,
  assertRateLimitOk,
  assertMinInterval,
  RateLimitError,
  DailyLimitError,
} from '@/modules/distribution/service'
import { publishPostTask } from './publish-post'

export interface GrowthTickPayload {
  /** Sem `productId`: roda pra todo produto elegível (`validating`/`launched`) — é o que o cron chama. */
  productId?: string
}

type Channel = 'bluesky' | 'linkedin' | 'reddit'
const CHANNELS: readonly Channel[] = ['bluesky', 'linkedin', 'reddit']

async function listApprovedCandidates(productId: string, channel: Channel) {
  const posts = await listPosts(productId)
  return posts.filter((post) => post.status === 'approved' && post.channel === channel)
}

async function checkLimits(
  productId: string,
  channel: Channel,
  account: Awaited<ReturnType<typeof listActiveChannelAccounts>>[number],
  policy: NonNullable<Awaited<ReturnType<typeof getAutomationPolicy>>>,
): Promise<'ok' | 'blocked'> {
  try {
    await assertRateLimitOk(account, policy)
    await assertMinInterval(account, policy)
    return 'ok'
  } catch (err) {
    if (err instanceof RateLimitError || err instanceof DailyLimitError) {
      await recordDecision({
        productId,
        actor: 'growth-tick',
        decision: 'NO_ACTION',
        rationale: `Rate limit/limite diário para ${channel}: ${err.message}`,
      })
      return 'blocked'
    }
    throw err
  }
}

async function createManualPublication(
  productId: string,
  channel: Channel,
  account: Awaited<ReturnType<typeof listActiveChannelAccounts>>[number],
): Promise<{ action: 'SCHEDULED' | 'NO_ACTION'; publicationId?: string; postId?: string; reason?: string }> {
  const policy = await getAutomationPolicy(productId, channel)
  if (!policy || policy.level === 'suggestions_only' || policy.killSwitch) {
    return { action: 'NO_ACTION', reason: 'policy_not_eligible' }
  }

  const pendingCount = await countAwaitingManualByChannel(productId, channel)
  if (pendingCount >= policy.maxPostsPerDay) {
    await recordDecision({
      productId,
      actor: 'growth-tick',
      decision: 'NO_ACTION',
      rationale: `Fila manual cheia para ${channel} (${pendingCount}/${policy.maxPostsPerDay}).`,
    })
    return { action: 'NO_ACTION', reason: 'manual_queue_full' }
  }

  if (await checkLimits(productId, channel, account, policy) === 'blocked') {
    return { action: 'NO_ACTION', reason: 'rate_limited' }
  }

  const candidates = await listApprovedCandidates(productId, channel)
  const post = candidates[candidates.length - 1]
  if (!post) {
    await recordDecision({
      productId,
      actor: 'growth-tick',
      decision: 'NO_ACTION',
      rationale: `Nenhum post aprovado disponível para ${channel}.`,
    })
    return { action: 'NO_ACTION', reason: 'no_approved_post' }
  }

  const scheduledFor = new Date()
  const idempotencyKey = buildIdempotencyKey(post.id, account.id, scheduledFor)
  if (await findPublicationByIdempotencyKey(idempotencyKey)) {
    return { action: 'NO_ACTION', reason: 'duplicate_tick' }
  }

  const publication = await insertPublication({
    productId,
    postId: post.id,
    channelAccountId: account.id,
    idempotencyKey,
    scheduledFor,
    status: 'awaiting_manual',
  })
  await setPostStatus(post.id, 'scheduled')

  try {
    const content = await renderPublicationContent(publication.id)
    const validation = getChannel(channel).validate(content)
    if (!validation.valid) {
      await resolvePublication(publication.id, {
        status: 'failed',
        lastError: { errors: validation.errors },
      })
      return { action: 'NO_ACTION', reason: 'invalid_content' }
    }
  } catch (error) {
    await resolvePublication(publication.id, {
      status: 'failed',
      lastError: { error: error instanceof Error ? error.message : String(error) },
    })
    throw error
  }

  await recordDecision({
    productId,
    actor: 'growth-tick',
    decision: 'SCHEDULE',
    rationale: `Post ${post.id} aguardando publicação manual no ${channel} (conta: ${account.handle}).`,
  })

  return { action: 'SCHEDULED', publicationId: publication.id, postId: post.id }
}

async function runManualPass(productId: string): Promise<Array<Record<string, unknown>>> {
  const results: Array<Record<string, unknown>> = []

  for (const channel of CHANNELS) {
    if (!isManualChannel(channel)) continue

    const policy = await getAutomationPolicy(productId, channel)
    if (!policy || policy.level === 'suggestions_only') continue
    if (policy.killSwitch) {
      results.push({ channel, action: 'NO_ACTION', reason: 'channel_kill_switch' })
      continue
    }

    const account = (await listActiveChannelAccounts(productId, channel))[0]
    if (!account) {
      await recordDecision({
        productId,
        actor: 'growth-tick',
        decision: 'NO_ACTION',
        rationale: `Canal manual ${channel} sem cadastro.`,
      })
      results.push({ channel, action: 'NO_ACTION', reason: 'manual_channel_not_registered' })
      continue
    }

    // allowedHours não se aplica ao momento de criação da fila manual.
    results.push({ channel, ...(await createManualPublication(productId, channel, account)) })
  }

  return results
}

async function runApiPass(productId: string): Promise<Record<string, unknown>> {
  for (const channel of CHANNELS) {
    if (isManualChannel(channel)) continue

    const policy = await getAutomationPolicy(productId, channel)
    if (!policy || policy.level === 'suggestions_only') continue
    if (policy.killSwitch) {
      logger.info('Kill switch ativo para canal', { productId, channel })
      continue
    }

    if (!isWithinAllowedHours(policy)) {
      await recordDecision({
        productId,
        actor: 'growth-tick',
        decision: 'NO_ACTION',
        rationale: `Fora da janela de horário permitida para ${channel}.`,
      })
      continue
    }

    const account = (await listActiveChannelAccounts(productId, channel))[0]
    if (!account) continue
    if (await checkLimits(productId, channel, account, policy) === 'blocked') continue

    const candidates = await listApprovedCandidates(productId, channel)
    const post = candidates[candidates.length - 1]
    if (!post) {
      await recordDecision({
        productId,
        actor: 'growth-tick',
        decision: 'NO_ACTION',
        rationale: `Nenhum post aprovado disponível para ${channel}.`,
      })
      continue
    }

    const scheduledFor = new Date()
    const idempotencyKey = buildIdempotencyKey(post.id, account.id, scheduledFor)
    if (await findPublicationByIdempotencyKey(idempotencyKey)) continue

    const publication = await insertPublication({
      productId,
      postId: post.id,
      channelAccountId: account.id,
      idempotencyKey,
      scheduledFor,
    })

    await recordDecision({
      productId,
      actor: 'growth-tick',
      decision: 'SCHEDULE',
      rationale: `Post ${post.id} agendado para ${channel} (conta: ${account.handle}) às ${scheduledFor.toISOString()}.`,
    })

    if (policy.level === 'automatic') {
      if (process.env.TRIGGER_SECRET_KEY) {
        await publishPostTask.trigger({ publicationId: publication.id })
      } else {
        logger.info('Trigger.dev não configurado — publicação criada mas não disparada', {
          publicationId: publication.id,
        })
      }
    }

    return {
      action: 'SCHEDULED',
      channel,
      publicationId: publication.id,
      postId: post.id,
      level: policy.level,
    }
  }

  return { action: 'NO_ACTION', reason: 'no_eligible_api_channel' }
}

/** Executa as passadas manual e API sem que uma consuma a vaga da outra. */
export async function runGrowthTickForProduct(productId: string) {
  const product = await findProduct(productId)
  if (product && (product.stage === 'idea' || product.stage === 'building')) {
    await recordDecision({
      productId,
      actor: 'growth-tick',
      decision: 'NO_ACTION',
      rationale: `Produto em estágio '${product.stage}' — publicação pausada.`,
    })
    return { manual: [], api: { action: 'NO_ACTION', reason: 'wrong_stage' } }
  }

  const config = await getSystemConfig()
  if (config.globalKillSwitch) {
    await recordDecision({
      productId,
      actor: 'growth-tick',
      decision: 'NO_ACTION',
      rationale: 'Kill switch global ativo.',
    })
    return { manual: [], api: { action: 'NO_ACTION', reason: 'global_kill_switch' } }
  }

  const manual = await runManualPass(productId)
  const api = await runApiPass(productId)
  return { manual, api }
}

export const growthTickTask = task({
  id: 'growth-tick',
  maxDuration: 300,
  run: async (payload: GrowthTickPayload) => {
    if (payload.productId) return runGrowthTickForProduct(payload.productId)

    const productIds = await findProductIdsByStage(['validating', 'launched'])
    logger.info('Growth tick sem productId — rodando pra todo produto elegível', {
      count: productIds.length,
    })

    const results: Array<{ productId: string; result: Awaited<ReturnType<typeof runGrowthTickForProduct>> }> = []
    let failed = 0
    for (const productId of productIds) {
      try {
        results.push({ productId, result: await runGrowthTickForProduct(productId) })
      } catch (err) {
        failed++
        logger.error(`Falha no growth tick do produto ${productId}`, { error: err })
      }
    }

    return { count: productIds.length, failed, results }
  },
})

export const growthTickCron = schedules.task({
  id: 'growth-tick-hourly',
  cron: '0 * * * *',
  maxDuration: 300,
  run: async () => growthTickTask.triggerAndWait({}),
})
