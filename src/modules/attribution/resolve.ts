import { findTrackingLinkByRef, findLastVisitorLink } from './repo'

export type AttributionResult = {
  model: 'direct' | 'last_touch' | 'first_touch' | 'none'
  trackingLinkId?: string
  campaignId?: string
  postId?: string
  publicationId?: string
  audienceSegmentId?: string
  channel?: string
}

const LAST_TOUCH_WINDOW_MS = 30 * 24 * 60 * 60 * 1000 // 30 dias

/**
 * Regra de resolução:
 * 1. ref presente → busca tracking_link pelo ref no mesmo produto → direct
 * 2. sem ref mas com visitorId → procura última visita ≤ 30 dias → last_touch
 * 3. demais casos → none
 */
export async function resolveAttribution(params: {
  ref?: string | null
  visitorId?: string | null
  productId: string
}): Promise<AttributionResult> {
  const { ref, visitorId, productId } = params

  if (ref) {
    const link = await findTrackingLinkByRef(ref, productId)
    if (link) {
      return {
        model: 'direct',
        trackingLinkId: link.id,
        campaignId: link.campaignId ?? undefined,
        postId: link.postId ?? undefined,
        publicationId: link.publicationId ?? undefined,
        channel: link.utmSource,
      }
    }
    // ref inválido ou de outro produto → none (não vaza dados)
    return { model: 'none' }
  }

  if (visitorId) {
    const sinceMs = Date.now() - LAST_TOUCH_WINDOW_MS
    const link = await findLastVisitorLink(productId, visitorId, sinceMs)
    if (link) {
      return {
        model: 'last_touch',
        trackingLinkId: link.id,
        campaignId: link.campaignId ?? undefined,
        postId: link.postId ?? undefined,
        publicationId: link.publicationId ?? undefined,
        channel: link.utmSource,
      }
    }
  }

  return { model: 'none' }
}
