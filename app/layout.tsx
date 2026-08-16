import type { Metadata } from 'next'
import Link from 'next/link'
import { currentUser } from '@/server/auth'
import { SignOutButton } from './_components/auth-buttons'
import './globals.css'

export const metadata: Metadata = {
  title: 'GrowthOS',
  description: 'Plataforma autônoma de crescimento e distribuição para SaaS.',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser()

  return (
    <html lang="pt-BR">
      <body className="min-h-screen">
        {user && (
          <header className="border-line bg-panel/70 sticky top-0 z-10 border-b backdrop-blur">
            <div className="mx-auto flex max-w-5xl items-center gap-6 px-6 py-3">
              <Link href="/" className="font-mono text-sm font-semibold tracking-tight">
                Growth<span className="text-accent">OS</span>
              </Link>
              <nav className="text-ink-soft flex items-center gap-5 text-sm">
                <Link href="/" className="hover:text-ink transition-colors">
                  Painel
                </Link>
                <Link href="/products" className="hover:text-ink transition-colors">
                  Produtos
                </Link>
              </nav>
              <div className="ml-auto flex items-center gap-3">
                <span className="text-ink-faint hidden text-xs sm:inline">{user.email}</span>
                <SignOutButton />
              </div>
            </div>
          </header>
        )}
        <main className="mx-auto max-w-5xl px-6 py-10">{children}</main>
      </body>
    </html>
  )
}
