import { recordDecision } from '@/lib/observability/service'
import { setPostStatus } from '@/modules/content/repo'
import { getChannel, isManualChannel } from './channels/registry'
import {
  confirmAwaitingManualPublication,
  discardAwaitingManualPublication,
  findChannelAccountByProductChannel,
  findPublication,
  insertChannelAccount,
  listAwaitingManualPublications,
  listChannelAccounts,
  countManualPendingByProductRepo as countPendingByProduct,
  updateChannelAccount,
} from './repo'
import { recordSuccessfulRequest } from './service'
import { renderPublicationContent } from './render'
import type { ChannelAccount, Publication } from './schema'

const MANUAL_EXPIRATION_MS = 3 * 24 * 60 * 60 * 1000

export interface ManualQueueItem {
  publicationId: string
  productId: string
  postId: string
  channel: ChannelAccount['channel']
  pageName: string
  pageUrl: string | null
  text: string
  linkUrl?: string
  createdAt: Date
  expiresAt: Date
  openUrl: string
}

export function validateHttpUrl(value: string, fieldName: string): string | undefined {
  try {
    const url = new URL(value)
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || !url.hostname) {
      return `${fieldName} deve ser uma URL http(s) válida.`
    }
    return undefined
  } catch {
    return `${fieldName} deve ser uma URL http(s) válida.`
  }
}

export async function confirmManualPublication(
  publicationId: string,
  externalUrl?: string,
): Promise<{ publication: Publication; idempotent: boolean }> {
  if (externalUrl) {
    const error = validateHttpUrl(externalUrl, 'URL do post')
    if (error) throw new Error(error)
  }

  const current = await findPublication(publicationId)
  if (!current) throw new Error('Publicação não encontrada.')
  if (current.status === 'published') return { publication: current, idempotent: true }
  if (current.status !== 'awaiting_manual') {
    throw new Error('Publicação não está aguardando confirmação manual.')
  }

  const now = new Date()
  const updated = await confirmAwaitingManualPublication(publicationId, {
    publishedAt: now,
    manualConfirmedAt: now,
    externalUrl: externalUrl ?? null,
  })
  if (!updated) {
    const afterRace = await findPublication(publicationId)
    if (afterRace?.status === 'published') return { publication: afterRace, idempotent: true }
    throw new Error('Publicação deixou de aguardar confirmação manual.')
  }

  await setPostStatus(updated.postId, 'published')
  await recordSuccessfulRequest(updated.channelAccountId)
  await recordDecision({
    productId: updated.productId,
    actor: 'human',
    decision: 'PUBLISH',
    rationale: 'publicado manualmente',
  })
  return { publication: updated, idempotent: false }
}

export async function discardManualPublication(
  publicationId: string,
): Promise<{ publication: Publication; idempotent: boolean }> {
  const current = await findPublication(publicationId)
  if (!current) throw new Error('Publicação não encontrada.')
  if (current.status === 'cancelled') return { publication: current, idempotent: true }
  if (current.status !== 'awaiting_manual') {
    throw new Error('Publicação não está aguardando confirmação manual.')
  }

  const updated = await discardAwaitingManualPublication(publicationId)
  if (!updated) {
    const afterRace = await findPublication(publicationId)
    if (afterRace?.status === 'cancelled') return { publication: afterRace, idempotent: true }
    throw new Error('Publicação deixou de aguardar confirmação manual.')
  }

  await setPostStatus(updated.postId, 'cancelled')
  await recordDecision({
    productId: updated.productId,
    actor: 'human',
    decision: 'CANCEL',
    rationale: 'descartado na fila manual',
  })
  return { publication: updated, idempotent: false }
}

export async function registerManualChannel(
  productId: string,
  channel: ChannelAccount['channel'],
  data: { pageName: string; pageUrl?: string },
): Promise<ChannelAccount> {
  if (!isManualChannel(channel)) throw new Error('Somente canais manuais podem usar cadastro leve.')

  const pageName = data.pageName.trim()
  if (!pageName) throw new Error('Nome da página é obrigatório.')
  const pageUrl = data.pageUrl?.trim() || null
  if (pageUrl) {
    const error = validateHttpUrl(pageUrl, 'URL da página')
    if (error) throw new Error(error)
  }

  const existing = await findChannelAccountByProductChannel(productId, channel)
  if (existing) {
    return (await updateChannelAccount(existing.id, {
      handle: pageName,
      displayName: pageName,
      pageUrl,
      credentials: null,
      status: 'active',
    }))!
  }

  return insertChannelAccount({
    productId,
    channel,
    handle: pageName,
    displayName: pageName,
    pageUrl,
    credentials: null,
    status: 'active',
  })
}

export async function listManualQueue(productId: string): Promise<ManualQueueItem[]> {
  const publications = await listAwaitingManualPublications(productId)
  const accounts = await listChannelAccounts(productId)
  const accountsById = new Map(accounts.map((account) => [account.id, account]))
  const result: ManualQueueItem[] = []

  for (const publication of publications) {
    const account = accountsById.get(publication.channelAccountId)
    if (!account) continue
    const content = await renderPublicationContent(publication.id)
    const adapter = getChannel(account.channel)
    result.push({
      publicationId: publication.id,
      productId: publication.productId,
      postId: publication.postId,
      channel: account.channel,
      pageName: account.displayName ?? account.handle,
      pageUrl: account.pageUrl,
      text: content.text,
      linkUrl: content.linkUrl,
      createdAt: publication.createdAt,
      expiresAt: new Date(publication.createdAt.getTime() + MANUAL_EXPIRATION_MS),
      openUrl: account.pageUrl ?? adapter.fallbackUrl ?? '',
    })
  }
  return result
}

export async function countManualPendingByProduct(): Promise<Record<string, number>> {
  return countPendingByProduct()
}

export { MANUAL_EXPIRATION_MS }
