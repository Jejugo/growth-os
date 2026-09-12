'use server'

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
} from '@/modules/distribution/repo'
import { buildIdempotencyKey } from '@/modules/distribution/publisher'
import { dispatchPublishPost } from '@/server/jobs'
import type { ChannelAccount, AutomationPolicy } from '@/modules/distribution/schema'
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
