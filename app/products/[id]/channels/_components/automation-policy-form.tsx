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
    <form onSubmit={handleSave} className="border-line space-y-3 border-t pt-4">
      <div className="flex items-center justify-between">
        <p className="card-kicker">Política de automação</p>
        <button
          type="button"
          onClick={handleKillSwitch}
          className="border-line flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs"
        >
          <span
            className={`relative block h-[15px] w-[26px] flex-none rounded-full transition-colors ${
              policy?.killSwitch ? 'bg-danger/45' : 'bg-line'
            }`}
          >
            <span
              className={`bg-ink absolute top-0.5 h-[11px] w-[11px] rounded-full transition-all ${
                policy?.killSwitch ? 'right-0.5' : 'left-0.5'
              }`}
            />
          </span>
          {policy?.killSwitch ? 'Kill switch ativo' : 'Kill switch'}
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="field">
          <label>Nível de automação</label>
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value as AutomationPolicy['level'])}
            className="input"
          >
            {Object.entries(levelLabels).map(([val, lbl]) => (
              <option key={val} value={val}>
                {lbl}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>Máx. posts/dia</label>
          <input
            type="number"
            min={1}
            max={10}
            value={maxPerDay}
            onChange={(e) => setMaxPerDay(Number(e.target.value))}
            className="input"
            style={{ fontFamily: 'var(--font-mono)' }}
          />
        </div>

        <div className="field">
          <label>Intervalo mínimo (min)</label>
          <input
            type="number"
            min={30}
            max={1440}
            step={30}
            value={minInterval}
            onChange={(e) => setMinInterval(Number(e.target.value))}
            className="input"
            style={{ fontFamily: 'var(--font-mono)' }}
          />
        </div>
      </div>

      <button type="submit" disabled={loading} className="btn btn-primary">
        {loading ? 'Salvando…' : 'Salvar política'}
      </button>
    </form>
  )
}
