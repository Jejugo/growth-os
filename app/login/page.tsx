import { redirect } from 'next/navigation'
import { currentUser } from '@/server/auth'
import { SignInButton } from '../_components/auth-buttons'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const user = await currentUser()
  if (user) redirect('/')

  const { error } = await searchParams

  return (
    <div className="mx-auto mt-24 max-w-sm">
      <h1 className="font-mono text-2xl font-semibold tracking-tight">
        Growth<span className="text-accent">OS</span>
      </h1>
      <p className="text-ink-soft mt-2 text-sm">
        Ferramenta interna. O acesso é restrito à allowlist de e-mails.
      </p>

      {error && (
        <p className="border-danger/30 bg-danger-soft text-danger mt-6 rounded-md border px-3 py-2 text-sm">
          {error === 'AccessDenied'
            ? 'Esse e-mail não está na allowlist.'
            : 'Não foi possível entrar. Tente de novo.'}
        </p>
      )}

      <div className="mt-8">
        <SignInButton />
      </div>
    </div>
  )
}
