'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { cancelPublicationAction } from '../../../../actions/distribution'
import { Spinner } from '../../../../_components/spinner'
import type { Publication, ChannelAccount } from '@/modules/distribution'
import type { SocialPost } from '@/modules/content'

const statusConfig: Record<Publication['status'], { label: string; cls: string }> = {
  scheduled: { label: 'agendado', cls: 'text-accent border border-accent/35' },
  publishing: { label: 'publicando…', cls: 'text-warn border border-warn/35' },
  published: { label: 'publicado', cls: 'text-ok border border-ok/35' },
  failed: { label: 'falhou', cls: 'text-danger border border-danger/35' },
  unknown: { label: 'desconhecido', cls: 'text-warn border border-warn/35' },
  cancelled: { label: 'cancelado', cls: 'tag-neutral' },
  awaiting_manual: { label: 'esperando você', cls: 'text-accent border border-accent/35' },
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
  post,
}: {
  publication: Publication
  account?: ChannelAccount
  post?: SocialPost
}) {
  const router = useRouter()
  const [cancelling, setCancelling] = useState(false)
  const { label, cls } = statusConfig[publication.status]
  const lastErr = publication.lastError as {
    error?: string
    reason?: string
    errors?: string[]
  } | null

  const errorMessage = lastErr?.error ?? lastErr?.reason ?? lastErr?.errors?.[0] ?? null

  async function handleCancel() {
    if (!confirm('Cancelar esta publicação?')) return
    setCancelling(true)
    await cancelPublicationAction(publication.id)
    setCancelling(false)
    router.refresh()
  }

  return (
    <div className="border-warn/30 bg-warn-soft space-y-1 rounded-md border px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="tag tag-neutral shrink-0 font-mono">{account?.channel ?? '—'}</span>
        <span className="min-w-0 flex-1 truncate text-sm">
          {post?.hook ?? (account ? `@${account.handle}` : '—')}
        </span>
        <span className={`tag shrink-0 font-mono ${cls}`}>{label}</span>
        <span className="text-ink-faint hidden shrink-0 font-mono text-xs sm:inline">
          tentativa {publication.attemptCount}/5
        </span>
        <span className="text-ink-faint hidden shrink-0 font-mono text-xs sm:inline">
          {fmt(publication.scheduledFor)}
        </span>
        {publication.externalUrl && (
          <a
            href={publication.externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent shrink-0 text-xs hover:underline"
          >
            Ver post ↗
          </a>
        )}
        {['scheduled', 'unknown'].includes(publication.status) && (
          <button onClick={handleCancel} disabled={cancelling} className="btn btn-ghost shrink-0">
            {cancelling && <Spinner size="xs" />}
            {cancelling ? 'Cancelando…' : 'Cancelar'}
          </button>
        )}
      </div>

      {errorMessage && (
        <p className="text-danger text-xs" title={errorMessage}>
          {errorMessage}
        </p>
      )}
    </div>
  )
}
