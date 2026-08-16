import { signIn, signOut } from '@/server/auth'

export function SignInButton() {
  return (
    <form
      action={async () => {
        'use server'
        await signIn('github', { redirectTo: '/' })
      }}
    >
      <button
        type="submit"
        className="bg-ink text-surface hover:bg-ink-soft w-full rounded-lg px-4 py-2.5 text-sm font-medium transition-colors"
      >
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
