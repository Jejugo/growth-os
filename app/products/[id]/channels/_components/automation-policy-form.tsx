'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { saveAutomationPolicy, toggleChannelKillSwitch } from '../../../../actions/distribution'
import { Spinner } from '../../../../_components/spinner'
import type { AutomationPolicy } from '@/modules/distribution'

interface Props {
  productId: string
  channel: AutomationPolicy['channel']
  policy?: AutomationPolicy
  isManual?: boolean
}

const levelLabels: Record<AutomationPolicy['level'], string> = {
  automatic: 'Automático',
  approval_required: 'Requer aprovação',
  suggestions_only: 'Apenas sugestões',
}

// Brasília não observa horário de verão desde 2019 — offset fixo é seguro aqui.
const BRT_OFFSET_HOURS = 3
const WEEK_DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

function buildAllowedHours(startLocal: number, endLocal: number): Record<string, [number, number][]> {
  const utcStart = (startLocal + BRT_OFFSET_HOURS) % 24
  const utcEnd = (endLocal + BRT_OFFSET_HOURS) % 24

  const windows: [number, number][] =
    utcStart === utcEnd
      ? [[0, 24]]
      : utcStart < utcEnd
        ? [[utcStart, utcEnd]]
        : [
            [0, utcEnd],
            [utcStart, 24],
          ]

  return Object.fromEntries(WEEK_DAYS.map((day) => [day, windows]))
}

function decodeAllowedHours(allowedHours: unknown): { enabled: boolean; start: number; end: number } {
  const fallback = { enabled: false, start: 8, end: 22 }
  if (!allowedHours || typeof allowedHours !== 'object') return fallback

  const monWindows = (allowedHours as Record<string, [number, number][]>).mon
  if (!monWindows || monWindows.length === 0) return fallback

  const toLocal = (utcHour: number) => (utcHour - BRT_OFFSET_HOURS + 24) % 24

  if (monWindows.length === 1) {
    const [utcStart, utcEnd] = monWindows[0]!
    return { enabled: true, start: toLocal(utcStart), end: toLocal(utcEnd) }
  }

  const tailFromMidnight = monWindows.find(([start]) => start === 0)
  const headUntilMidnight = monWindows.find(([, end]) => end === 24)
  if (tailFromMidnight && headUntilMidnight) {
    return { enabled: true, start: toLocal(headUntilMidnight[0]), end: toLocal(tailFromMidnight[1]) }
  }

  return fallback
}

export function AutomationPolicyForm({ productId, channel, policy, isManual = false }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const initialLevel = isManual && policy?.level !== 'suggestions_only'
    ? 'approval_required'
    : policy?.level ?? 'approval_required'
  const [level, setLevel] = useState<AutomationPolicy['level']>(
    initialLevel,
  )
  const [maxPerDay, setMaxPerDay] = useState(policy?.maxPostsPerDay ?? 2)
  const [minInterval, setMinInterval] = useState(policy?.minMinutesBetweenPosts ?? 120)
  const decodedHours = decodeAllowedHours(policy?.allowedHours)
  const [hoursEnabled, setHoursEnabled] = useState(decodedHours.enabled)
  const [startHour, setStartHour] = useState(decodedHours.start)
  const [endHour, setEndHour] = useState(decodedHours.end)
  const [killSwitchLoading, setKillSwitchLoading] = useState(false)
  const initialPolicy = useMemo(
    () => ({
      level: initialLevel,
      maxPerDay: policy?.maxPostsPerDay ?? 2,
      minInterval: policy?.minMinutesBetweenPosts ?? 120,
      hoursEnabled: decodedHours.enabled,
      startHour: decodedHours.start,
      endHour: decodedHours.end,
    }),
    [
      decodedHours.enabled,
      decodedHours.end,
      decodedHours.start,
      initialLevel,
      policy?.maxPostsPerDay,
      policy?.minMinutesBetweenPosts,
    ],
  )
  const dirty =
    level !== initialPolicy.level ||
    maxPerDay !== initialPolicy.maxPerDay ||
    minInterval !== initialPolicy.minInterval ||
    hoursEnabled !== initialPolicy.hoursEnabled ||
    startHour !== initialPolicy.startHour ||
    endHour !== initialPolicy.endHour

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    await saveAutomationPolicy(productId, channel, {
      level: isManual && level !== 'suggestions_only' ? 'approval_required' : level,
      maxPostsPerDay: maxPerDay,
      minMinutesBetweenPosts: minInterval,
      allowedHours: isManual ? null : hoursEnabled ? buildAllowedHours(startHour, endHour) : null,
    })
    setLoading(false)
    router.refresh()
  }

  async function handleKillSwitch() {
    const newValue = !policy?.killSwitch
    if (newValue && !confirm(`Ativar kill switch para ${channel}? Nenhum post será publicado neste canal até você desativar.`)) {
      return
    }
    setKillSwitchLoading(true)
    await toggleChannelKillSwitch(productId, channel, newValue)
    setKillSwitchLoading(false)
    router.refresh()
  }

  return (
    <form onSubmit={handleSave} className="border-line space-y-3 border-t pt-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="card-kicker">Política de automação</p>
        <button
          type="button"
          onClick={handleKillSwitch}
          disabled={killSwitchLoading}
          className="border-line flex min-h-11 items-center gap-2 rounded-md border px-3 py-2 text-xs disabled:opacity-60"
        >
          {killSwitchLoading ? (
            <Spinner size="xs" />
          ) : (
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
          )}
          {policy?.killSwitch ? 'Kill switch ativo' : 'Kill switch'}
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="field">
          <label>Nível de automação</label>
          {isManual ? (
            <>
              <select
                value={level}
                onChange={(e) => setLevel(e.target.value as AutomationPolicy['level'])}
                className="input"
              >
                <option value="approval_required">Ativo — você publica manualmente</option>
                <option value="suggestions_only">Apenas sugestões</option>
              </select>
              <p className="text-ink-faint mt-1.5 text-xs">
                Automático e requer aprovação têm o mesmo comportamento aqui: o “Publiquei” é a aprovação.
              </p>
            </>
          ) : (
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
          )}
        </div>

        <div className="field">
          <label>{isManual ? 'Máx. itens na fila' : 'Máx. posts/dia'}</label>
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

      {!isManual && (
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={hoursEnabled}
              onChange={(e) => setHoursEnabled(e.target.checked)}
            />
            Restringir janela de horário
          </label>

          {hoursEnabled && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="field">
                <label>Início (horário de Brasília)</label>
                <input
                  type="number"
                  min={0}
                  max={23}
                  value={startHour}
                  onChange={(e) => setStartHour(Number(e.target.value))}
                  className="input"
                  style={{ fontFamily: 'var(--font-mono)' }}
                />
              </div>
              <div className="field">
                <label>Fim (horário de Brasília)</label>
                <input
                  type="number"
                  min={0}
                  max={23}
                  value={endHour}
                  onChange={(e) => setEndHour(Number(e.target.value))}
                  className="input"
                  style={{ fontFamily: 'var(--font-mono)' }}
                />
              </div>
              <p className="text-ink-faint col-span-full text-xs">
                Posts só são publicados dentro dessa janela, todos os dias. Fora dela, o growth-tick
                espera até a próxima janela abrir.
              </p>
            </div>
          )}
        </div>
      )}

      {isManual && (
        <p className="text-ink-faint text-xs">
          A janela de horário não se aplica: o horário final depende de quando você publicar. O limite acima também controla o tamanho máximo da fila.
        </p>
      )}

      <button type="submit" disabled={loading || !dirty} className="btn btn-primary">
        {loading && <Spinner size="xs" />}
        {loading ? 'Salvando…' : 'Salvar política'}
      </button>
    </form>
  )
}
