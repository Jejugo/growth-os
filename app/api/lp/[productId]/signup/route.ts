import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { sha256 } from '@/lib/ids'
import { findProduct } from '@/modules/products'
import { insertWaitlistSignup } from '@/modules/validation/repo'
import { resolveAttribution } from '@/modules/attribution/resolve'
import { insertGrowthEvent } from '@/modules/attribution/repo'

export const runtime = 'nodejs'

const bodySchema = z.object({
  email: z.string().email(),
  vid: z.string().optional(),
  ref: z.string().optional(),
})

/**
 * A landing gerada não tem como guardar segredo (é HTML/JS público servido de
 * outro domínio), então este endpoint é público por natureza — sem `ingest
 * key`, diferente de `/api/events`. CORS reflete o `Origin` só quando bate
 * com `*.vercel.app` (onde a landing é publicada hoje) ou com o domínio do
 * próprio produto, em vez de `*` sem checagem nenhuma.
 */
function corsOrigin(origin: string | null, productDomain: string | null): string | null {
  if (!origin) return null
  try {
    const host = new URL(origin).hostname
    if (host.endsWith('.vercel.app')) return origin
    if (productDomain && host === productDomain) return origin
  } catch {
    return null
  }
  return null
}

function corsHeaders(origin: string | null): HeadersInit {
  if (!origin) return {}
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}

export async function OPTIONS(req: NextRequest, { params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params
  const product = await findProduct(productId)
  const allowedOrigin = corsOrigin(req.headers.get('origin'), product?.domain ?? null)
  return new NextResponse(null, { status: 204, headers: corsHeaders(allowedOrigin) })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ productId: string }> },
) {
  const { productId } = await params
  const product = await findProduct(productId)
  const allowedOrigin = corsOrigin(req.headers.get('origin'), product?.domain ?? null)
  const headers = corsHeaders(allowedOrigin)

  if (!product) {
    return NextResponse.json({ error: 'Produto não encontrado.' }, { status: 404, headers })
  }

  let body: z.infer<typeof bodySchema>
  try {
    body = bodySchema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: 'Payload inválido.' }, { status: 400, headers })
  }

  const email = body.email.trim().toLowerCase()

  await insertWaitlistSignup({ productId, email, visitorId: body.vid ?? null })

  const attribution = await resolveAttribution({
    ref: body.ref ?? null,
    visitorId: body.vid ?? null,
    productId,
  })

  try {
    await insertGrowthEvent({
      productId,
      visitorId: body.vid ?? null,
      externalUserId: null,
      eventType: 'signup',
      campaignId: attribution.campaignId ?? null,
      postId: attribution.postId ?? null,
      publicationId: attribution.publicationId ?? null,
      trackingLinkId: attribution.trackingLinkId ?? null,
      channel: attribution.channel ?? null,
      value: null,
      attributionModel: attribution.model,
      metadata: {},
      occurredAt: new Date(),
      dedupeKey: `signup:${productId}:${sha256(email)}`,
    })
  } catch {
    // dedupeKey já existe — signup já processado antes, ok responder sucesso igual.
  }

  // Sempre 200, mesmo se o e-mail já existia — não dá pra revelar isso pra quem chama.
  return NextResponse.json({ ok: true }, { status: 200, headers })
}
