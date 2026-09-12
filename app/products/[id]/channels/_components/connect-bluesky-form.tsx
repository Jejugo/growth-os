'use client'

import { useState } from 'react'
import { connectBlueskyAccount } from '../../../../actions/distribution'
import { useRouter } from 'next/navigation'
import { Spinner } from '../../../../_components/spinner'

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
      <button onClick={() => setOpen(true)} className="btn btn-secondary">
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
    <form onSubmit={handleSubmit} className="border-line space-y-3 rounded-md border p-4">
      <p className="text-sm font-medium">Conectar conta Bluesky</p>

      {error && <p className="text-danger text-sm">{error}</p>}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="field">
          <label>Handle (ex: usuario.bsky.social)</label>
          <input
            type="text"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            required
            placeholder="usuario.bsky.social"
            className="input"
          />
        </div>

        <div className="field">
          <label>Nome de exibição (opcional)</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Meu Produto"
            className="input"
          />
        </div>
      </div>

      <div className="field">
        <label>App Password (não sua senha principal)</label>
        <input
          type="password"
          value={appPassword}
          onChange={(e) => setAppPassword(e.target.value)}
          required
          placeholder="xxxx-xxxx-xxxx-xxxx"
          className="input"
        />
        <p className="text-ink-faint mt-1.5 text-xs">
          Gere em Configurações → App Passwords no Bluesky. Armazenada cifrada (AES-256-GCM).
        </p>
      </div>

      <div className="flex gap-2">
        <button type="submit" disabled={loading} className="btn btn-primary">
          {loading && <Spinner size="xs" />}
          {loading ? 'Conectando…' : 'Conectar'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost">
          Cancelar
        </button>
      </div>
    </form>
  )
}
