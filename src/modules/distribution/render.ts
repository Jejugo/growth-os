import { logger } from '@trigger.dev/sdk'
import { env } from '@/lib/env'
import { createTrackingLink } from '@/modules/attribution/link'
import { findTrackingLinkByPostAndPublication } from '@/modules/attribution/repo'
import { findPost } from '@/modules/content/repo'
import { findChannelAccount, findPublication } from './repo'
import type { RenderedContent } from './types'

const CHANNEL_GRAPHEME_LIMITS: Record<string, number> = {
  bluesky: 300,
  linkedin: 3000,
  reddit: 10000,
}

function isPublicBaseUrl(url: string): boolean {
  try {
    const { hostname, protocol } = new URL(url)
    if (protocol !== 'http:' && protocol !== 'https:') return false
    return hostname !== 'localhost' && hostname !== '127.0.0.1'
  } catch {
    return false
  }
}

function countGraphemes(text: string): number {
  try {
    return [...new Intl.Segmenter().segment(text)].length
  } catch {
    return text.length
  }
}

function buildText(
  hook: string,
  body: string,
  cta: string | null,
  maxGraphemes: number,
): string {
  const hookText = hook.trim()
  if (countGraphemes(hookText) >= maxGraphemes) return hookText

  const withBody = body ? `${hookText}\n\n${body.trim()}` : hookText
  if (countGraphemes(withBody) > maxGraphemes) return hookText
  if (!cta) return withBody

  const withCta = `${withBody}\n\n${cta.trim()}`
  return countGraphemes(withCta) > maxGraphemes ? withBody : withCta
}

function appendUrlIfFits(
  hook: string,
  body: string,
  cta: string | null,
  url: string,
  maxGraphemes: number,
): string {
  const suffix = `\n${url}`
  const suffixLen = countGraphemes(suffix)
  const full = buildText(hook, body, cta, maxGraphemes)
  if (countGraphemes(full) + suffixLen <= maxGraphemes) return full + suffix

  const withoutCta = buildText(hook, body, null, maxGraphemes)
  if (countGraphemes(withoutCta) + suffixLen <= maxGraphemes) return withoutCta + suffix
  return full
}

/**
 * Renderiza o texto final da publicação e cria/reutiliza o tracking link.
 * A chave `(postId, publicationId)` mantém a operação idempotente.
 */
export async function renderPublicationContent(publicationId: string): Promise<RenderedContent> {
  const publication = await findPublication(publicationId)
  if (!publication) throw new Error(`Publicação ${publicationId} não encontrada.`)

  const account = await findChannelAccount(publication.channelAccountId)
  if (!account) throw new Error(`Conta de canal ${publication.channelAccountId} não encontrada.`)

  const post = await findPost(publication.postId)
  if (!post) throw new Error(`Post ${publication.postId} não encontrado.`)
  if (post.productId !== publication.productId || post.productId !== account.productId) {
    throw new Error('Post, publicação e conta de canal pertencem a produtos diferentes.')
  }

  const maxGraphemes = CHANNEL_GRAPHEME_LIMITS[account.channel] ?? 3000
  const baseUrl = env().NEXT_PUBLIC_BASE_URL
  let linkUrl = post.linkUrl ?? undefined
  let text: string

  if (linkUrl) {
    if (isPublicBaseUrl(baseUrl)) {
      const existing = await findTrackingLinkByPostAndPublication(post.id, publicationId)
      const trackingLink = existing ?? (await createTrackingLink({
        productId: post.productId,
        campaignId: post.campaignId,
        postId: post.id,
        publicationId,
        destinationUrl: linkUrl,
        utmSource: account.channel,
        utmMedium: 'social',
        utmCampaign: post.campaignId,
        utmContent: post.id.replace(/^[a-z]+_/, '').slice(0, 16),
      }))
      linkUrl = `${baseUrl}/r/${trackingLink.code}`
    } else {
      logger.warn('NEXT_PUBLIC_BASE_URL não é público — publicando sem link de tracking', {
        postId: post.id,
        publicationId,
        baseUrl,
      })
    }
    text = appendUrlIfFits(post.hook, post.body, post.cta, linkUrl, maxGraphemes)
  } else {
    text = buildText(post.hook, post.body, post.cta, maxGraphemes)
  }

  return { text, linkUrl, graphemeCount: countGraphemes(text) }
}
