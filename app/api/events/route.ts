import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import {
  findIngestKey,
  touchIngestKey,
  insertGrowthEvent,
  upsertVisitor,
} from '../../../src/modules/attribution/repo'
import { resolveAttribution } from '../../../src/modules/attribution/resolve'

const bodySchema = z.object({
  eventType: z.enum(['impression', 'click', 'signup', 'activation', 'paid', 'churn']),
  vid: z.string().optional(),
  ref: z.string().optional(),
  externalUserId: z.string().optional(),
  occurredAt: z.string().datetime().optional(),
  dedupeKey: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
  value: z.number().optional(),
})

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization') ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const keyHash = createHash('sha256').update(token).digest('hex')
  const ingestKey = await findIngestKey(keyHash)

  if (!ingestKey) {
    return NextResponse.json({ error: 'Invalid or revoked key' }, { status: 401 })
  }

  let body: z.infer<typeof bodySchema>
  try {
    const raw = await req.json()
    body = bodySchema.parse(raw)
  } catch {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  const productId = ingestKey.productId
  const attribution = await resolveAttribution({
    ref: body.ref ?? null,
    visitorId: body.vid ?? null,
    productId,
  })

  const occurredAt = body.occurredAt ? new Date(body.occurredAt) : new Date()

  try {
    await insertGrowthEvent({
      productId,
      visitorId: body.vid ?? null,
      externalUserId: body.externalUserId ?? null,
      eventType: body.eventType,
      campaignId: attribution.campaignId ?? null,
      postId: attribution.postId ?? null,
      publicationId: attribution.publicationId ?? null,
      trackingLinkId: attribution.trackingLinkId ?? null,
      channel: attribution.channel ?? null,
      value: body.value != null ? String(body.value) : null,
      attributionModel: attribution.model,
      metadata: body.metadata ?? {},
      occurredAt,
      dedupeKey: body.dedupeKey,
    })
  } catch {
    // dedupeKey já existe → já processado, retorna 202 igualmente
    await touchIngestKey(ingestKey.id)
    return NextResponse.json({ accepted: true, duplicate: true }, { status: 202 })
  }

  // Se signup/paid: upsert visitor com externalUserId para cruzamento futuro
  if (
    (body.eventType === 'signup' || body.eventType === 'paid') &&
    body.vid &&
    body.externalUserId
  ) {
    await upsertVisitor({
      productId,
      visitorId: body.vid,
      externalUserId: body.externalUserId,
    })
  }

  await touchIngestKey(ingestKey.id)
  return NextResponse.json({ accepted: true }, { status: 202 })
}
