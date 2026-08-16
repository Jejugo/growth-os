import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { users, sessions } from '@/modules/auth/schema'
import { eq } from 'drizzle-orm'

// Dev-only bypass — nunca incluir em produção
export async function GET() {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'not available' }, { status: 404 })
  }

  const email = process.env.AUTH_ALLOWED_EMAILS?.split(',')[0]?.trim()
  if (!email) return NextResponse.json({ error: 'no allowed email' }, { status: 500 })

  let userId: string
  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1)
  if (existing.length > 0) {
    userId = existing[0]!.id
  } else {
    const [created] = await db
      .insert(users)
      .values({ email, name: 'Dev User' })
      .returning()
    userId = created!.id
  }

  const token = crypto.randomUUID()
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

  await db.insert(sessions).values({ sessionToken: token, userId, expires })

  const res = NextResponse.redirect(new URL('/', process.env.NEXTAUTH_URL ?? 'http://localhost:3002'))
  res.cookies.set('authjs.session-token', token, {
    httpOnly: true,
    expires,
    path: '/',
    sameSite: 'lax',
  })
  return res
}
