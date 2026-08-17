import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import {
  findTrackingLinkByCode,
  upsertVisitor,
  insertGrowthEvent,
  incrementClickCount,
} from '../../../src/modules/attribution/repo'

export const runtime = 'nodejs'

const BOT_PATTERNS =
  /bot|crawler|spider|scraper|curl|wget|python|java|go-http|axios|node-fetch|libwww/i

function isBot(userAgent: string): boolean {
  return BOT_PATTERNS.test(userAgent)
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params
  const ua = req.headers.get('user-agent') ?? ''

  const link = await findTrackingLinkByCode(code)
  if (!link) {
    const res = NextResponse.redirect(new URL('/', req.url), { status: 302 })
    res.headers.set('X-Redirect-Reason', 'invalid-code')
    return res
  }

  const bot = isBot(ua)

  // Lê ou gera cookie de visitante
  const existingVid = req.cookies.get('gos_vid')?.value
  const visitorId = bot ? null : (existingVid ?? randomUUID())

  const occurredAt = new Date()
  const dedupeKey = bot
    ? `click:bot:${code}:${Math.floor(Date.now() / 60000)}`
    : `click:${code}:${visitorId ?? 'anon'}:${Math.floor(Date.now() / 60000)}`

  // Upsert visitante e grava evento de forma fire-and-forget (sem bloquear redirect)
  const track = async () => {
    if (!bot && visitorId) {
      await upsertVisitor({
        productId: link.productId,
        visitorId,
        trackingLinkId: link.id,
      })
    }

    try {
      await insertGrowthEvent({
        productId: link.productId,
        visitorId: visitorId ?? null,
        eventType: 'click',
        campaignId: link.campaignId ?? null,
        postId: link.postId ?? null,
        publicationId: link.publicationId ?? null,
        trackingLinkId: link.id,
        channel: link.utmSource,
        attributionModel: 'direct',
        metadata: bot ? { bot: true } : {},
        occurredAt,
        dedupeKey,
      })
    } catch {
      // dedupeKey já existe — idempotente, ignorar
    }

    await incrementClickCount(link.id)
  }

  // Registrar tracking sem bloquear o redirect
  const trackPromise = track()

  // Destino: generatedUrl já tem UTMs; adicionamos ref e vid para rastreio client-side
  const destination = new URL(link.generatedUrl)
  if (visitorId) destination.searchParams.set('vid', visitorId)

  const response = NextResponse.redirect(destination.toString(), { status: 302 })

  if (!bot && visitorId && !existingVid) {
    const maxAge = 90 * 24 * 60 * 60 // 90 dias em segundos
    response.cookies.set('gos_vid', visitorId, {
      maxAge,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      path: '/',
    })
  }

  // Aguarda tracking (Vercel Edge suporta waitUntil; no runtime Node, await direto é ok)
  await trackPromise

  return response
}
