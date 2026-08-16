import NextAuth from 'next-auth'
import GitHub from 'next-auth/providers/github'
import { DrizzleAdapter } from '@auth/drizzle-adapter'
import { db } from '@/lib/db'
import { env } from '@/lib/env'
import { users, accounts, sessions, verificationTokens } from '@/modules/auth/schema'

/**
 * Auth de usuário único: GitHub OAuth + allowlist de e-mail. Sem papéis, sem
 * times, sem convites — a Fase 0 não precisa e a seção 2 do init.md proíbe.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: 'database' },
  providers: [
    GitHub({
      clientId: env().AUTH_GITHUB_ID,
      clientSecret: env().AUTH_GITHUB_SECRET,
    }),
  ],
  pages: { signIn: '/login', error: '/login' },
  callbacks: {
    signIn({ user, profile }) {
      const email = (user.email ?? profile?.email ?? '').toLowerCase()
      return isAllowed(email)
    },
  },
})

export function isAllowed(email: string | null | undefined): boolean {
  if (!email) return false
  return env().AUTH_ALLOWED_EMAILS.includes(email.toLowerCase())
}

export interface CurrentUser {
  id: string
  email: string
  name: string | null
  image: string | null
}

/**
 * Sessão válida E ainda na allowlist. A checagem dupla importa: o callback de
 * signIn roda uma vez, então tirar um e-mail da allowlist não expulsaria
 * ninguém já logado sem esta verificação a cada request.
 */
export async function currentUser(): Promise<CurrentUser | null> {
  const session = await auth()
  const email = session?.user?.email
  if (!session?.user?.id || !isAllowed(email)) return null
  return {
    id: session.user.id,
    email: email!,
    name: session.user.name ?? null,
    image: session.user.image ?? null,
  }
}
