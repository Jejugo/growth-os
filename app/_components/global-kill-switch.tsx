'use client'

import { useTransition } from 'react'
import { toggleGlobalKillSwitch } from '../actions/distribution'
import { useRouter } from 'next/navigation'

export function GlobalKillSwitch({ active }: { active: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function handleToggle() {
    const next = !active
    if (next && !confirm('Ativar kill switch global? Nenhum post será publicado em nenhum canal até você desativar.')) {
      return
    }
    startTransition(async () => {
      await toggleGlobalKillSwitch(next)
      router.refresh()
    })
  }

  return (
    <button
      onClick={handleToggle}
      disabled={pending}
      title={active ? 'Kill switch global ativo — clique para desativar' : 'Kill switch global inativo'}
      className={[
        'rounded px-2 py-1 text-xs font-semibold transition-colors',
        active
          ? 'bg-red-600 text-white hover:bg-red-700'
          : 'border-line border text-ink-soft hover:text-red-600',
        pending ? 'opacity-50 cursor-wait' : '',
      ].join(' ')}
    >
      {active ? '🛑 KS ON' : '🛑 KS'}
    </button>
  )
}
