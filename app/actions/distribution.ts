'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/server/guard'
import { encryptCredentials } from '@/modules/distribution/credentials'
import {
  insertChannelAccount,
  deleteChannelAccount,
  upsertAutomationPolicy,
  setGlobalKillSwitch,
  setChannelAccountStatus,
  cancelPublication,
  insertPublication,
  findChannelAccount,
} from '@/modules/distribution'
import { buildIdempotencyKey } from '@/modules/distribution/publisher'
import { isManualChannel } from '@/modules/distribution/channels/registry'
import {
  confirmManualPublication as confirmManualPublicationService,
  discardManualPublication as discardManualPublicationService,
  registerManualChannel as registerManualChannelService,
  listManualQueue as listManualQueueService,
  countManualPendingByProduct as countManualPendingByProductService,
} from '@/modules/distribution/manual'
import { dispatchPublishPost } from '@/server/jobs'
import type { ChannelAccount, AutomationPolicy } from '@/modules/distribution'
import type { BlueskyCredentials } from '@/modules/distribution/types'

// --- Kill switch global -------------------------------------------------

export async function toggleGlobalKillSwitch(value: boolean): Promise<void> {
  await requireUser()
  await setGlobalKillSwitch(value)
}

// --- Contas de canal ----------------------------------------------------

export async function connectBlueskyAccount(
  productId: string,
  data: { handle: string; displayName?: string; appPassword: string },
): Promise<{ success: boolean; error?: string }> {
  await requireUser()

  const creds: BlueskyCredentials = {
    identifier: data.handle,
    appPassword: data.appPassword,
  }

  try {
    const encrypted = encryptCredentials(creds)
    await insertChannelAccount({
      productId,
      channel: 'bluesky',
      handle: data.handle,
      displayName: data.displayName ?? null,
      credentials: encrypted,
    })
    return { success: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro ao conectar conta.'
    return { success: false, error: msg }
  }
}

export async function disconnectChannelAccount(accountId: string): Promise<void> {
  await requireUser()
  await deleteChannelAccount(accountId)
}

export async function pauseChannelAccount(accountId: string): Promise<void> {
  await requireUser()
  await setChannelAccountStatus(accountId, 'paused')
}

export async function resumeChannelAccount(accountId: string): Promise<void> {
  await requireUser()
  await setChannelAccountStatus(accountId, 'active')
}

// --- Políticas de automação ---------------------------------------------

export async function saveAutomationPolicy(
  productId: string,
  channel: AutomationPolicy['channel'],
  values: {
    level?: AutomationPolicy['level']
    maxPostsPerDay?: number
    minMinutesBetweenPosts?: number
    allowedHours?: AutomationPolicy['allowedHours']
    killSwitch?: boolean
  },
): Promise<void> {
  await requireUser()
  await upsertAutomationPolicy(productId, channel, values)
}

export async function toggleChannelKillSwitch(
  productId: string,
  channel: AutomationPolicy['channel'],
  value: boolean,
): Promise<void> {
  await requireUser()
  await upsertAutomationPolicy(productId, channel, { killSwitch: value })
}

// --- Publicações --------------------------------------------------------

export async function scheduleAndPublish(
  productId: string,
  postId: string,
  channelAccountId: string,
): Promise<{ publicationId: string }> {
  await requireUser()

  const scheduledFor = new Date()
  const account = await findChannelAccount(channelAccountId)
  if (account && isManualChannel(account.channel)) {
    throw new Error('Canal manual deve ser publicado pela fila manual.')
  }
  const idempotencyKey = buildIdempotencyKey(postId, channelAccountId, scheduledFor)

  const pub = await insertPublication({
    productId,
    postId,
    channelAccountId,
    idempotencyKey,
    scheduledFor,
  })

  await dispatchPublishPost({ publicationId: pub.id })

  return { publicationId: pub.id }
}

export async function cancelPublicationAction(publicationId: string): Promise<void> {
  await requireUser()
  await cancelPublication(publicationId)
}

/** Confirma um item manual; `externalUrl` aceita qualquer URL http(s) válida. */
export async function confirmManualPublication(
  publicationId: string,
  externalUrl?: string,
): Promise<{ success: true; idempotent: boolean } | { error: string }> {
  await requireUser()
  try {
    const result = await confirmManualPublicationService(publicationId, externalUrl?.trim() || undefined)
    revalidatePath(`/products/${result.publication.productId}/publications`)
    revalidatePath(`/products/${result.publication.productId}`)
    return { success: true, idempotent: result.idempotent }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Não foi possível confirmar a publicação.' }
  }
}

/** Descarta definitivamente um item manual e seu post. */
export async function discardManualPublication(
  publicationId: string,
): Promise<{ success: true; idempotent: boolean } | { error: string }> {
  await requireUser()
  try {
    const result = await discardManualPublicationService(publicationId)
    revalidatePath(`/products/${result.publication.productId}/publications`)
    revalidatePath(`/products/${result.publication.productId}`)
    return { success: true, idempotent: result.idempotent }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Não foi possível descartar a publicação.' }
  }
}

/** Cria ou atualiza o cadastro leve de um canal manual. */
export async function registerManualChannel(
  productId: string,
  channel: ChannelAccount['channel'],
  data: { pageName: string; pageUrl?: string },
): Promise<{ success: true } | { error: string }> {
  await requireUser()
  try {
    await registerManualChannelService(productId, channel, data)
    revalidatePath(`/products/${productId}/channels`)
    return { success: true }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Não foi possível salvar o canal manual.' }
  }
}

/** Consulta a fila manual pronta para renderização na UI. */
export async function listManualQueue(productId: string) {
  await requireUser()
  return listManualQueueService(productId)
}

/** Retorna a quantidade de itens pendentes agrupada por produto. */
export async function countManualPendingByProduct() {
  await requireUser()
  return countManualPendingByProductService()
}
