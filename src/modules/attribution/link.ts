import { randomBytes } from 'node:crypto'
import { db } from '@/lib/db'
import { trackingLinks } from './schema'
import { env } from '@/lib/env'
import type { TrackingLink } from './schema'

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

export function generateCode(): string {
  const bytes = randomBytes(6)
  let result = ''
  for (let i = 0; i < 8; i++) {
    result += BASE62[bytes[i % 6]! % 62]
  }
  return result
}

export function generateRef(): string {
  return 'gr_' + randomBytes(4).toString('hex')
}

export async function createTrackingLink(params: {
  productId: string
  campaignId?: string
  postId?: string
  publicationId?: string
  destinationUrl: string
  utmSource: string
  utmMedium: string
  utmCampaign: string
  utmContent?: string
}): Promise<TrackingLink> {
  // Gera code e ref com retry em caso de colisão (improvável mas seguro)
  let code = generateCode()
  let ref = generateRef()

  const url = new URL(params.destinationUrl)
  url.searchParams.set('utm_source', params.utmSource)
  url.searchParams.set('utm_medium', params.utmMedium)
  url.searchParams.set('utm_campaign', params.utmCampaign)
  if (params.utmContent) url.searchParams.set('utm_content', params.utmContent)
  url.searchParams.set('ref', ref)

  const baseUrl = env().NEXT_PUBLIC_BASE_URL

  try {
    const [link] = await db
      .insert(trackingLinks)
      .values({
        productId: params.productId,
        campaignId: params.campaignId ?? null,
        postId: params.postId ?? null,
        publicationId: params.publicationId ?? null,
        code,
        ref,
        destinationUrl: params.destinationUrl,
        generatedUrl: url.toString(),
        utmSource: params.utmSource,
        utmMedium: params.utmMedium,
        utmCampaign: params.utmCampaign,
        utmContent: params.utmContent ?? null,
      })
      .returning()
    return link!
  } catch (err: unknown) {
    // Colisão de unique constraint → retenta com novos valores
    const msg = err instanceof Error ? err.message : ''
    if (msg.includes('unique') || msg.includes('duplicate')) {
      code = generateCode()
      ref = generateRef()
      url.searchParams.set('ref', ref)
      const redirectUrl = `${baseUrl}/r/${code}`
      void redirectUrl // usado externamente
      const [link] = await db
        .insert(trackingLinks)
        .values({
          productId: params.productId,
          campaignId: params.campaignId ?? null,
          postId: params.postId ?? null,
          publicationId: params.publicationId ?? null,
          code,
          ref,
          destinationUrl: params.destinationUrl,
          generatedUrl: url.toString(),
          utmSource: params.utmSource,
          utmMedium: params.utmMedium,
          utmCampaign: params.utmCampaign,
          utmContent: params.utmContent ?? null,
        })
        .returning()
      return link!
    }
    throw err
  }
}
