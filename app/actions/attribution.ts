'use server'

import { requireUser } from '@/server/guard'
import {
  createIngestKey,
  revokeIngestKey,
  listIngestKeys,
} from '@/modules/attribution/repo'
import { createTrackingLink } from '@/modules/attribution/link'
import type { IngestKey, TrackingLink } from '@/modules/attribution/schema'

// --- Chaves de ingestão ---------------------------------------------------

export async function createIngestKeyAction(
  productId: string,
  name: string,
): Promise<{ key: IngestKey; rawKey: string }> {
  await requireUser()
  return createIngestKey({ productId, name })
}

export async function revokeIngestKeyAction(
  productId: string,
  keyId: string,
): Promise<void> {
  await requireUser()
  await revokeIngestKey(keyId, productId)
}

export async function listIngestKeysAction(productId: string): Promise<IngestKey[]> {
  await requireUser()
  return listIngestKeys(productId)
}

// --- Tracking Links --------------------------------------------------------

export async function createTrackingLinkAction(
  productId: string,
  params: {
    destinationUrl: string
    utmSource: string
    utmMedium: string
    utmCampaign: string
    utmContent?: string
    campaignId?: string
    postId?: string
    publicationId?: string
  },
): Promise<TrackingLink> {
  await requireUser()
  return createTrackingLink({ productId, ...params })
}
