import { signIn, signOut } from '@/server/auth'

export function SignInButton() {
  return (
    <form
      action={async () => {
        'use server'
        await signIn('github', { redirectTo: '/' })
      }}
    >
      <button type="submit" className="btn btn-primary w-full">
        Entrar com GitHub
      </button>
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
      <button
        type="submit"
        className="text-ink-faint hover:text-ink text-xs transition-colors"
      >
        Sair
      </button>
    </form>
  )
}
