'use client'

import { useRouter } from 'next/navigation'
import { disconnectChannelAccount, pauseChannelAccount, resumeChannelAccount } from '../../../../actions/distribution'
import type { ChannelAccount } from '@/modules/distribution/schema'

const statusLabel: Record<ChannelAccount['status'], { label: string; cls: string }> = {
  active: { label: 'ativo', cls: 'text-ok border border-ok/35' },
  paused: { label: 'pausado', cls: 'text-warn border border-warn/35' },
  error: { label: 'erro', cls: 'text-danger border border-danger/35' },
  revoked: { label: 'revogado', cls: 'tag-neutral' },
}

export function ChannelAccountCard({ account }: { account: ChannelAccount }) {
  const router = useRouter()
  const { label, cls } = statusLabel[account.status]

  async function handlePauseResume() {
    if (account.status === 'active') {
      await pauseChannelAccount(account.id)
    } else {
      await resumeChannelAccount(account.id)
    }
    router.refresh()
  }

  async function handleDisconnect() {
    if (!confirm(`Desconectar @${account.handle}? Esta ação não pode ser desfeita.`)) return
    await disconnectChannelAccount(account.id)
    router.refresh()
  }

  return (
    <div className="border-line flex items-center gap-3 rounded-md border px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">@{account.handle}</p>
        {account.displayName && (
          <p className="text-ink-faint truncate text-xs">{account.displayName}</p>
        )}
        {account.lastErrorMessage && (
          <p className="text-danger mt-0.5 truncate text-xs">{account.lastErrorMessage}</p>
        )}
      </div>
      <span className={`tag font-mono ${cls}`}>{label}</span>
      <button onClick={handlePauseResume} className="btn btn-ghost">
        {account.status === 'active' ? 'Pausar' : 'Reativar'}
      </button>
      <button
        onClick={handleDisconnect}
        className="btn btn-ghost"
        style={{ color: 'var(--color-danger)' }}
      >
        Desconectar
      </button>
    </div>
  )
}
