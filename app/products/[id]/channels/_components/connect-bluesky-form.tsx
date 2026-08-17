'use client'

import { useState } from 'react'
import { connectBlueskyAccount } from '../../../../actions/distribution'
import { useRouter } from 'next/navigation'

export function ConnectBlueskyForm({ productId }: { productId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [handle, setHandle] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [appPassword, setAppPassword] = useState('')

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="bg-accent/10 text-accent hover:bg-accent/20 rounded px-3 py-1.5 text-sm font-medium transition-colors"
      >
        Conectar conta Bluesky
      </button>
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const result = await connectBlueskyAccount(productId, {
      handle: handle.trim().replace(/^@/, ''),
      displayName: displayName.trim() || undefined,
      appPassword: appPassword.trim(),
    })

    setLoading(false)

    if (result.success) {
      setOpen(false)
      setHandle('')
      setAppPassword('')
      router.refresh()
    } else {
      setError(result.error ?? 'Erro desconhecido.')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="border-line rounded border p-4 space-y-3 bg-surface">
      <p className="text-sm font-medium text-ink">Conectar conta Bluesky</p>

      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="text-xs text-ink-soft">Handle (ex: usuario.bsky.social)</span>
          <input
            type="text"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            required
            placeholder="usuario.bsky.social"
            className="border-line w-full rounded border bg-canvas px-2 py-1.5 text-sm text-ink outline-none focus:ring-1 focus:ring-accent"
          />
        </label>

        <label className="space-y-1">
          <span className="text-xs text-ink-soft">Nome de exibição (opcional)</span>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Meu Produto"
            className="border-line w-full rounded border bg-canvas px-2 py-1.5 text-sm text-ink outline-none focus:ring-1 focus:ring-accent"
          />
        </label>
      </div>

      <label className="block space-y-1">
        <span className="text-xs text-ink-soft">App Password (não sua senha principal)</span>
        <input
          type="password"
          value={appPassword}
          onChange={(e) => setAppPassword(e.target.value)}
          required
          placeholder="xxxx-xxxx-xxxx-xxxx"
          className="border-line w-full rounded border bg-canvas px-2 py-1.5 text-sm text-ink outline-none focus:ring-1 focus:ring-accent"
        />
        <p className="text-xs text-ink-faint">
          Gere em Configurações → App Passwords no Bluesky. Armazenada cifrada (AES-256-GCM).
        </p>
      </label>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading}
          className="bg-accent text-white rounded px-3 py-1.5 text-sm font-medium disabled:opacity-50"
        >
          {loading ? 'Conectando…' : 'Conectar'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-ink-soft hover:text-ink text-sm"
        >
          Cancelar
        </button>
      </div>
    </form>
  )
}
