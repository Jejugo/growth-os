'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { disconnectChannelAccount, pauseChannelAccount, resumeChannelAccount } from '../../../../actions/distribution'
import { Spinner } from '../../../../_components/spinner'
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
  const [pauseLoading, setPauseLoading] = useState(false)
  const [disconnectLoading, setDisconnectLoading] = useState(false)

  async function handlePauseResume() {
    setPauseLoading(true)
    if (account.status === 'active') {
      await pauseChannelAccount(account.id)
    } else {
      await resumeChannelAccount(account.id)
    }
    setPauseLoading(false)
    router.refresh()
  }

  async function handleDisconnect() {
    if (!confirm(`Desconectar @${account.handle}? Esta ação não pode ser desfeita.`)) return
    setDisconnectLoading(true)
    await disconnectChannelAccount(account.id)
    setDisconnectLoading(false)
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
      <button onClick={handlePauseResume} disabled={pauseLoading} className="btn btn-ghost">
        {pauseLoading && <Spinner size="xs" />}
        {pauseLoading ? 'Aguarde…' : account.status === 'active' ? 'Pausar' : 'Reativar'}
      </button>
      <button
        onClick={handleDisconnect}
        disabled={disconnectLoading}
        className="btn btn-ghost"
        style={{ color: 'var(--color-danger)' }}
      >
        {disconnectLoading && <Spinner size="xs" className="text-danger" />}
        {disconnectLoading ? 'Desconectando…' : 'Desconectar'}
      </button>
    </div>
  )
}
