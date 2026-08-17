'use client'

import { useRouter } from 'next/navigation'
import { disconnectChannelAccount, pauseChannelAccount, resumeChannelAccount } from '../../../../actions/distribution'
import type { ChannelAccount } from '@/modules/distribution/schema'

const statusLabel: Record<ChannelAccount['status'], { label: string; cls: string }> = {
  active: { label: 'Ativo', cls: 'text-green-700 bg-green-100 dark:text-green-400 dark:bg-green-900/30' },
  paused: { label: 'Pausado', cls: 'text-yellow-700 bg-yellow-100 dark:text-yellow-400 dark:bg-yellow-900/30' },
  error: { label: 'Erro', cls: 'text-red-700 bg-red-100 dark:text-red-400 dark:bg-red-900/30' },
  revoked: { label: 'Revogado', cls: 'text-ink-faint bg-panel' },
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
    <div className="border-line flex items-center justify-between rounded border bg-surface px-3 py-2">
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink truncate">@{account.handle}</p>
        {account.displayName && (
          <p className="text-xs text-ink-soft truncate">{account.displayName}</p>
        )}
        {account.lastErrorMessage && (
          <p className="text-xs text-red-500 truncate mt-0.5">{account.lastErrorMessage}</p>
        )}
      </div>
      <div className="flex items-center gap-2 ml-2 shrink-0">
        <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${cls}`}>{label}</span>
        <button
          onClick={handlePauseResume}
          className="text-xs text-ink-soft hover:text-ink"
        >
          {account.status === 'active' ? 'Pausar' : 'Reativar'}
        </button>
        <button
          onClick={handleDisconnect}
          className="text-xs text-red-500 hover:text-red-700"
        >
          Desconectar
        </button>
      </div>
    </div>
  )
}
