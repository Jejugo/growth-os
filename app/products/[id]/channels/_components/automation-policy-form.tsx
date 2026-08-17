'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { saveAutomationPolicy, toggleChannelKillSwitch } from '../../../../actions/distribution'
import type { AutomationPolicy } from '@/modules/distribution/schema'

interface Props {
  productId: string
  channel: AutomationPolicy['channel']
  policy?: AutomationPolicy
}

const levelLabels: Record<AutomationPolicy['level'], string> = {
  automatic: 'Automático',
  approval_required: 'Requer aprovação',
  suggestions_only: 'Apenas sugestões',
}

export function AutomationPolicyForm({ productId, channel, policy }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [level, setLevel] = useState<AutomationPolicy['level']>(
    policy?.level ?? 'approval_required',
  )
  const [maxPerDay, setMaxPerDay] = useState(policy?.maxPostsPerDay ?? 2)
  const [minInterval, setMinInterval] = useState(policy?.minMinutesBetweenPosts ?? 120)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    await saveAutomationPolicy(productId, channel, {
      level,
      maxPostsPerDay: maxPerDay,
      minMinutesBetweenPosts: minInterval,
    })
    setLoading(false)
    router.refresh()
  }

  async function handleKillSwitch() {
    const newValue = !policy?.killSwitch
    if (newValue && !confirm(`Ativar kill switch para ${channel}? Nenhum post será publicado neste canal até você desativar.`)) {
      return
    }
    await toggleChannelKillSwitch(productId, channel, newValue)
    router.refresh()
  }

  return (
    <form onSubmit={handleSave} className="space-y-3 border-t border-line pt-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-ink-soft uppercase tracking-wide">Política</p>
        <button
          type="button"
          onClick={handleKillSwitch}
          className={[
            'rounded px-2 py-1 text-xs font-medium transition-colors',
            policy?.killSwitch
              ? 'bg-red-600 text-white hover:bg-red-700'
              : 'bg-panel border border-line text-ink-soft hover:text-red-600',
          ].join(' ')}
        >
          {policy?.killSwitch ? '🛑 Kill switch ON — clique para desativar' : 'Kill switch'}
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="space-y-1">
          <span className="text-xs text-ink-soft">Nível de automação</span>
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value as AutomationPolicy['level'])}
            className="border-line w-full rounded border bg-canvas px-2 py-1.5 text-sm text-ink outline-none"
          >
            {Object.entries(levelLabels).map(([val, lbl]) => (
              <option key={val} value={val}>{lbl}</option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className="text-xs text-ink-soft">Máx. posts/dia</span>
          <input
            type="number"
            min={1}
            max={10}
            value={maxPerDay}
            onChange={(e) => setMaxPerDay(Number(e.target.value))}
            className="border-line w-full rounded border bg-canvas px-2 py-1.5 text-sm text-ink outline-none"
          />
        </label>

        <label className="space-y-1">
          <span className="text-xs text-ink-soft">Intervalo mínimo (min)</span>
          <input
            type="number"
            min={30}
            max={1440}
            step={30}
            value={minInterval}
            onChange={(e) => setMinInterval(Number(e.target.value))}
            className="border-line w-full rounded border bg-canvas px-2 py-1.5 text-sm text-ink outline-none"
          />
        </label>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="bg-accent/10 text-accent hover:bg-accent/20 rounded px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50"
      >
        {loading ? 'Salvando…' : 'Salvar política'}
      </button>
    </form>
  )
}
