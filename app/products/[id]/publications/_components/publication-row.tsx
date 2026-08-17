'use client'

import { useRouter } from 'next/navigation'
import { cancelPublicationAction } from '../../../../actions/distribution'
import type { Publication, ChannelAccount } from '@/modules/distribution/schema'

const statusConfig: Record<
  Publication['status'],
  { label: string; cls: string }
> = {
  scheduled: { label: 'Agendado', cls: 'text-blue-700 bg-blue-100 dark:text-blue-400 dark:bg-blue-900/30' },
  publishing: { label: 'Publicando…', cls: 'text-yellow-700 bg-yellow-100 dark:text-yellow-400 dark:bg-yellow-900/30' },
  published: { label: 'Publicado', cls: 'text-green-700 bg-green-100 dark:text-green-400 dark:bg-green-900/30' },
  failed: { label: 'Falhou', cls: 'text-red-700 bg-red-100 dark:text-red-400 dark:bg-red-900/30' },
  unknown: { label: 'Desconhecido ⚠️', cls: 'text-yellow-700 bg-yellow-100 dark:text-yellow-400 dark:bg-yellow-900/30' },
  cancelled: { label: 'Cancelado', cls: 'text-ink-faint bg-panel' },
}

function fmt(date: Date | null | undefined): string {
  if (!date) return '—'
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date)
}

export function PublicationRow({
  publication,
  account,
}: {
  publication: Publication
  account?: ChannelAccount
}) {
  const router = useRouter()
  const { label, cls } = statusConfig[publication.status]
  const lastErr = publication.lastError as {
    error?: string
    reason?: string
    errors?: string[]
  } | null

  const errorMessage = lastErr?.error ?? lastErr?.reason ?? lastErr?.errors?.[0] ?? null

  async function handleCancel() {
    if (!confirm('Cancelar esta publicação?')) return
    await cancelPublicationAction(publication.id)
    router.refresh()
  }

  return (
    <div className="border-line rounded border bg-surface px-4 py-3 space-y-1">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-medium ${cls}`}>
            {label}
          </span>
          <span className="text-xs text-ink-soft capitalize truncate">
            {account?.channel ?? '—'} {account ? `@${account.handle}` : ''}
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs text-ink-faint hidden sm:inline">
            {fmt(publication.scheduledFor)}
          </span>
          {publication.externalUrl && (
            <a
              href={publication.externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-accent hover:underline"
            >
              Ver post ↗
            </a>
          )}
          {['scheduled', 'unknown'].includes(publication.status) && (
            <button
              onClick={handleCancel}
              className="text-xs text-red-500 hover:text-red-700"
            >
              Cancelar
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-4 text-xs text-ink-faint">
        <span>Tentativas: {publication.attemptCount}</span>
        {publication.publishedAt && <span>Publicado: {fmt(publication.publishedAt)}</span>}
      </div>

      {errorMessage && (
        <p className="text-xs text-red-500" title={errorMessage}>
          {errorMessage}
        </p>
      )}
    </div>
  )
}
