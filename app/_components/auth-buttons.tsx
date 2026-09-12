import { signIn, signOut } from '@/server/auth'
import { AuthSubmitButton } from './auth-submit-button'

export function SignInButton() {
  return (
    <form
      action={async () => {
        'use server'
        await signIn('github', { redirectTo: '/' })
      }}
    >
      <AuthSubmitButton
        label="Entrar com GitHub"
        pendingLabel="Entrando…"
        className="btn btn-primary w-full"
      />
    </form>
  )
}

export function SignOutButton() {
  return (
    <form
      action={async () => {
        'use server'
        await signOut({ redirectTo: '/login' })
      }}
    >
      <AuthSubmitButton
        label="Sair"
        pendingLabel="Saindo…"
        className="text-ink-faint hover:text-ink text-xs transition-colors"
      />
    </form>
  )
}
