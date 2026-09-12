import { task, schedules, logger } from '@trigger.dev/sdk'
import { recordDecision } from '@/lib/observability/service'
import { findProduct, findProductIdsByStage } from '@/modules/products'
import { listPosts } from '@/modules/content/repo'
import {
  getSystemConfig,
  getAutomationPolicy,
  listActiveChannelAccounts,
  insertPublication,
  findPublicationByIdempotencyKey,
} from '@/modules/distribution/repo'
import { buildIdempotencyKey } from '@/modules/distribution/publisher'
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

/**
 * Tick por produto. O cron acorda o planner; o planner decide.
 * NÃO publica diretamente — cria a publicação e enfileira publish-post.
 *
 * Heurística determinística de Fase 2:
 *   - post aprovado mais antigo ainda não publicado neste canal
 *   - respeita rotação de canal para não repetir o mesmo canal em sequência
 */
async function runGrowthTickForProduct(productId: string) {
  // Produto em 'idea' não tem conteúdo (sem landing); em 'building' a
  // publicação fica em silêncio deliberado (fase 4.5) — "anunciar semanas
  // de silêncio é pior do que não anunciar".
  const product = await findProduct(productId)
  if (product && (product.stage === 'idea' || product.stage === 'building')) {
    await recordDecision({
      productId,
      actor: 'growth-tick',
      decision: 'NO_ACTION',
      rationale: `Produto em estágio '${product.stage}' — publicação pausada.`,
    })
    return { action: 'NO_ACTION', reason: 'wrong_stage' }
  }

  // Verifica kill switch global
  const config = await getSystemConfig()
  if (config.globalKillSwitch) {
    await recordDecision({
      productId,
      actor: 'growth-tick',
      decision: 'NO_ACTION',
      rationale: 'Kill switch global ativo.',
    })
    return { action: 'NO_ACTION', reason: 'global_kill_switch' }
  }

  const channels = ['bluesky', 'linkedin', 'reddit'] as const

  for (const channel of channels) {
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

    const accounts = await listActiveChannelAccounts(productId, channel)
    if (accounts.length === 0) continue

    const account = accounts[0]!

    try {
      await assertRateLimitOk(account, policy)
      await assertMinInterval(account, policy)
    } catch (err) {
      if (err instanceof RateLimitError || err instanceof DailyLimitError) {
        await recordDecision({
          productId,
          actor: 'growth-tick',
          decision: 'NO_ACTION',
          rationale: `Rate limit/limite diário para ${channel}: ${err.message}`,
        })
        continue
      }
      throw err
    }

    // Seleciona post: mais antigo aprovado não publicado neste canal
    const approvedPosts = await listPosts(productId)
    const candidates = approvedPosts.filter((p) => p.status === 'approved' && p.channel === channel)

    if (candidates.length === 0) {
      await recordDecision({
        productId,
        actor: 'growth-tick',
        decision: 'NO_ACTION',
        rationale: `Nenhum post aprovado disponível para ${channel}.`,
      })
      continue
    }

    // Mais antigo primeiro (lista já está em desc, pegamos o último)
    const post = candidates[candidates.length - 1]!
    const scheduledFor = new Date()
    const idempotencyKey = buildIdempotencyKey(post.id, account.id, scheduledFor)

    // Idempotência: não cria publicação duplicada
    const existing = await findPublicationByIdempotencyKey(idempotencyKey)
    if (existing) {
      logger.info('Publicação já existe para este tick', { idempotencyKey })
      continue
    }

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
      // Enfileira a publicação
      if (process.env.TRIGGER_SECRET_KEY) {
        await publishPostTask.trigger({ publicationId: publication.id })
      } else {
        logger.info('Trigger.dev não configurado — publicação criada mas não disparada', {
          publicationId: publication.id,
        })
      }
    }
    // Se approval_required: publicação criada mas não executada — aguarda confirmação humana na UI

    // Um canal por tick — parar após o primeiro agendamento bem-sucedido
    return {
      action: 'SCHEDULED',
      channel,
      publicationId: publication.id,
      postId: post.id,
      level: policy.level,
    }
  }

  return { action: 'NO_ACTION', reason: 'no_eligible_channel' }
}

export const growthTickTask = task({
  id: 'growth-tick',
  maxDuration: 300,
  run: async (payload: GrowthTickPayload) => {
    if (payload.productId) {
      return runGrowthTickForProduct(payload.productId)
    }

    // Produto em 'idea'/'building' já é ignorado dentro de `runGrowthTickForProduct`, mas filtrar
    // aqui evita disparar (e logar decisão) pra produto que nunca vai fazer nada neste tick.
    const productIds = await findProductIdsByStage(['validating', 'launched'])
    logger.info('Growth tick sem productId — rodando pra todo produto elegível', {
      count: productIds.length,
    })

    const results: Array<{ productId: string; result: Awaited<ReturnType<typeof runGrowthTickForProduct>> }> = []
    let failed = 0

    for (const productId of productIds) {
      try {
        const result = await runGrowthTickForProduct(productId)
        results.push({ productId, result })
      } catch (err) {
        failed++
        logger.error(`Falha no growth tick do produto ${productId}`, { error: err })
      }
    }

    return { count: productIds.length, failed, results }
  },
})

/**
 * Único disparo automático do growth tick — sem isso, `growthTickTask` só roda se alguém chamar
 * `dispatchGrowthTick` manualmente (hoje ninguém chama). A cada hora cobre a folga confortável dado
 * que `minMinutesBetweenPosts`/limite diário de cada canal já governam a cadência real de posts.
 */
export const growthTickCron = schedules.task({
  id: 'growth-tick-hourly',
  cron: '0 * * * *',
  maxDuration: 300,
  run: async () => {
    return growthTickTask.triggerAndWait({})
  },
})
