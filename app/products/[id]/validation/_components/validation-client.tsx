'use client'

import { useActionState, useState } from 'react'
import {
  startValidationAction,
  abortValidationAction,
  recordSignalAction,
  concludeDueValidationsAction,
  type ActionState,
} from '../../../../actions/validation'
import type { ProductStage } from '@/modules/products'
import type { ProductBrief, Validation } from '@/modules/validation'

interface VariantRow {
  variantId: string
  label: string
  name: string
  description: string | null
  clicks: number
  signups: number
  activations: number
  paid: number
}

interface LiveMetrics {
  visitors: number
  signups: number
  activations: number
  paid: number
}

const VERDICT_LABEL: Record<string, string> = {
  build: 'Construir',
  pivot: 'Pivotar',
  kill: 'Matar',
  inconclusive: 'Inconclusivo',
}

const VERDICT_CLASS: Record<string, string> = {
  build: 'text-ok',
  pivot: 'text-warn',
  kill: 'text-danger',
  inconclusive: 'text-ink-faint',
}

export function ValidationClient({
  productId,
  stage,
  brief,
  running,
  history,
  liveMetrics,
  variants,
}: {
  productId: string
  stage: ProductStage
  brief: ProductBrief | null
  running: Validation | null
  history: Validation[]
  liveMetrics: LiveMetrics | null
  variants: VariantRow[]
}) {
  if (!brief) {
    return (
      <div className="panel text-ink-soft p-8 text-center text-sm">
        Este produto não tem brief de ideia — a validação da fase 4.5 é para produtos cadastrados
        como ideia, sem site ainda.
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <BriefCard brief={brief} />

      {running ? (
        <RunningValidation
          productId={productId}
          validation={running}
          metrics={liveMetrics}
          variants={variants}
        />
      ) : (
        (stage === 'idea' || stage === 'validating') && (
          <StartValidationForm productId={productId} />
        )
      )}

      {history.length > 0 && <HistorySection history={history} />}
    </div>
  )
}

function BriefCard({ brief }: { brief: ProductBrief }) {
  return (
    <section className="panel space-y-2 rounded-xl p-5">
      <h2 className="text-base font-semibold">Brief</h2>
      <p className="text-sm"><span className="text-ink-faint">Problema: </span>{brief.problem}</p>
      <p className="text-sm"><span className="text-ink-faint">Audiência: </span>{brief.audience}</p>
      <p className="text-sm"><span className="text-ink-faint">Solução: </span>{brief.solutionSketch}</p>
      <p className="text-sm font-medium">
        <span className="text-ink-faint font-normal">Hipótese mais arriscada: </span>
        {brief.riskiestAssumption}
      </p>
    </section>
  )
}

function StartValidationForm({ productId }: { productId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(startValidationAction, {})

  return (
    <form action={action} className="panel space-y-4 rounded-xl p-5">
      <input type="hidden" name="productId" value={productId} />
      <h2 className="text-base font-semibold">Iniciar validação</h2>

      <div>
        <div className="flex items-center gap-2 mb-1">
          <label className="label-xs block">Landing page (waitlist) *</label>
          <InfoIcon tooltip="URL da página que receberá o tráfego. Não precisa estar pronta agora, mas deve estar online antes de receber visitantes." />
        </div>
        <input
          name="landingUrl"
          required
          placeholder="https://minhaideia.com"
          className="w-full rounded-lg border border-line bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <p className="text-ink-faint mt-1 text-xs">
          O sistema traz tráfego; a landing você sobe (fora do escopo desta fase).
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field
          label="Janela (dias)"
          name="windowDays"
          defaultValue={14}
          help="Quantos dias a validação rodará antes de avaliar os resultados e tomar uma decisão."
        />
        <Field
          label="Mín. visitantes"
          name="minVisitors"
          defaultValue={300}
          help="Número mínimo de pessoas que devem visitar sua landing page durante a janela."
        />
        <Field
          label="Mín. inscrições"
          name="minSignups"
          defaultValue={100}
          help="Número mínimo de visitantes que devem se inscrever na lista de espera."
        />
        <Field
          label="Taxa mín. (%)"
          name="minSignupRatePct"
          defaultValue={4}
          step="0.1"
          help="Percentual mínimo de visitantes que devem se converter em inscrições (ex: 4% = 4 a cada 100)."
        />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field
          label="Mín. sinais fortes"
          name="minStrongSignals"
          defaultValue={5}
          help="Comentários, retweets, replies positivos ou outras interações diretas que indicam real interesse."
        />
      </div>
      <p className="text-ink-faint text-xs">
        Os limiares ficam travados assim que a validação começa a rodar — mudar exige abortar e
        recomeçar.
      </p>

      {state.error && <p className="text-danger text-xs">{state.error}</p>}
      {state.success && <p className="text-ok text-xs">{state.success}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50"
      >
        {pending ? 'Iniciando…' : 'Iniciar validação'}
      </button>
    </form>
  )
}

function Field({
  label,
  name,
  defaultValue,
  step,
  help,
}: {
  label: string
  name: string
  defaultValue: number
  step?: string
  help?: string
}) {
  return (
    <div>
      <div className="flex items-center gap-1 mb-1">
        <label className="label-xs block">{label}</label>
        {help && <InfoIcon tooltip={help} />}
      </div>
      <input
        name={name}
        type="number"
        step={step}
        defaultValue={defaultValue}
        className="w-full rounded-lg border border-line bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent"
      />
    </div>
  )
}

function InfoIcon({ tooltip }: { tooltip: string }) {
  const [showTooltip, setShowTooltip] = useState(false)

  return (
    <div className="relative inline-block">
      <button
        type="button"
        className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-line text-ink-faint hover:bg-accent hover:text-white transition-colors"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onFocus={() => setShowTooltip(true)}
        onBlur={() => setShowTooltip(false)}
        aria-label="Informação"
      >
        <svg
          className="w-3 h-3"
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
        </svg>
      </button>

      {showTooltip && (
        <div
          className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-48 text-white text-xs rounded-lg shadow-lg z-50 pointer-events-none border p-2"
          style={{ backgroundColor: '#1a1a1a', borderColor: '#333' }}
        >
          {tooltip}
          <div
            className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent"
            style={{ borderTopColor: '#1a1a1a' }}
          ></div>
        </div>
      )}
    </div>
  )
}

function RunningValidation({
  productId,
  validation,
  metrics,
  variants,
}: {
  productId: string
  validation: Validation
  metrics: LiveMetrics | null
  variants: VariantRow[]
}) {
  const [abortState, abortAction] = useActionState<ActionState, FormData>(abortValidationAction, {})
  const [showAbort, setShowAbort] = useState(false)

  const minVisitors = validation.minVisitors
  const minSignups = validation.minSignups
  const minSignupRate = Number(validation.minSignupRate)
  const minStrongSignals = validation.minStrongSignals

  const visitors = metrics?.visitors ?? 0
  const signups = metrics?.signups ?? 0
  const strongSignals = (metrics?.activations ?? 0) + (metrics?.paid ?? 0)
  const rate = visitors > 0 ? signups / visitors : 0

  const startedAt = validation.startedAt ? new Date(validation.startedAt) : null
  const endsAt = validation.endsAt ? new Date(validation.endsAt) : null
  const projection = projectSample({ startedAt, endsAt, visitors, minVisitors })

  return (
    <section className="panel space-y-5 rounded-xl p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">Validação em andamento</h2>
          <p className="text-ink-soft mt-1 text-sm">{validation.hypothesis}</p>
        </div>
        <button
          onClick={() => setShowAbort((v) => !v)}
          className="border-danger/30 text-danger hover:bg-danger/5 rounded-lg border px-3 py-1.5 text-xs font-medium"
        >
          Abortar
        </button>
      </div>

      <div className="flex flex-wrap gap-3 font-mono text-xs text-ink-faint">
        <span>início: {startedAt?.toLocaleDateString('pt-BR')}</span>
        <span>fim: {endsAt?.toLocaleDateString('pt-BR')}</span>
        <span>landing: {validation.landingUrl}</span>
      </div>

      {showAbort && (
        <form action={abortAction} className="flex items-center gap-2">
          <input type="hidden" name="productId" value={productId} />
          <input
            name="reason"
            required
            placeholder="Motivo do abandono"
            className="flex-1 rounded-lg border border-line bg-transparent px-3 py-1.5 text-sm"
          />
          <button type="submit" className="text-danger text-xs font-medium">
            Confirmar
          </button>
          {abortState.error && <p className="text-danger text-xs">{abortState.error}</p>}
        </form>
      )}

      {projection.warn && (
        <div className="border-warn/30 bg-warn-soft rounded-lg border p-3 text-sm">
          No ritmo atual, o teste não deve atingir {minVisitors} visitantes antes do fim da janela
          (projeção: ~{projection.projected} visitantes). Considere aumentar a distribuição.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Scoreboard label="Visitantes" value={visitors} threshold={minVisitors} />
        <Scoreboard label="Inscrições" value={signups} threshold={minSignups} />
        <Scoreboard
          label="Taxa"
          value={`${(rate * 100).toFixed(1)}%`}
          threshold={`${(minSignupRate * 100).toFixed(1)}%`}
          ok={rate >= minSignupRate}
        />
        <Scoreboard label="Sinais fortes" value={strongSignals} threshold={minStrongSignals} />
      </div>

      {variants.length > 0 && (
        <div>
          <h3 className="text-ink-soft mb-2 text-sm font-medium">Ângulos testados</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {variants.map((v) => (
              <div key={v.variantId} className="rounded-lg border border-line p-3">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-medium">{v.label}</span>
                  <span className="text-sm text-ink-soft">{v.name}</span>
                </div>
                {v.description && <p className="text-ink-faint mt-1 text-xs">{v.description}</p>}
                <div className="mt-2 flex gap-3 font-mono text-xs text-ink-faint">
                  <span>{v.clicks} cliques</span>
                  <span>{v.signups} inscrições</span>
                  <span>{v.activations + v.paid} fortes</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <ManualSignalForm productId={productId} />

      <form action={concludeDueValidationsAction}>
        <button type="submit" className="text-ink-faint hover:text-ink text-xs underline">
          Verificar validações vencidas agora
        </button>
      </form>
    </section>
  )
}

function Scoreboard({
  label,
  value,
  threshold,
  ok,
}: {
  label: string
  value: number | string
  threshold: number | string
  ok?: boolean
}) {
  const numericOk = ok ?? (typeof value === 'number' && typeof threshold === 'number' ? value >= threshold : undefined)
  return (
    <div className="rounded-lg border border-line p-3">
      <p className="text-ink-faint text-xs">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${numericOk ? 'text-ok' : ''}`}>{value}</p>
      <p className="text-ink-faint font-mono text-xs">mín.: {threshold}</p>
    </div>
  )
}

function ManualSignalForm({ productId }: { productId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(recordSignalAction, {})

  return (
    <form action={action} className="flex flex-wrap items-end gap-2 border-t border-line pt-4">
      <input type="hidden" name="productId" value={productId} />
      <div className="flex-1 min-w-[160px]">
        <label className="label-xs mb-1 block">Registrar sinal forte</label>
        <select
          name="kind"
          className="w-full rounded-lg border border-line bg-transparent px-3 py-2 text-sm"
        >
          <option value="activation">Conversa aceita / pesquisa respondida</option>
          <option value="paid">Pré-venda / depósito / carta de intenção</option>
        </select>
      </div>
      <input
        name="note"
        placeholder="Nota (opcional)"
        className="flex-[2] min-w-[160px] rounded-lg border border-line bg-transparent px-3 py-2 text-sm"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-50"
      >
        Registrar
      </button>
      {state.error && <p className="text-danger w-full text-xs">{state.error}</p>}
    </form>
  )
}

function HistorySection({ history }: { history: Validation[] }) {
  return (
    <section>
      <h2 className="label-xs mb-2">Histórico de validações</h2>
      <ul className="panel divide-line divide-y text-sm">
        {history.map((v) => (
          <li key={v.id} className="space-y-1 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-ink-faint">
                {new Date(v.createdAt).toLocaleDateString('pt-BR')}
              </span>
              <span className="text-ink-faint text-xs">{v.status}</span>
              {v.verdict && (
                <span className={`font-mono text-xs ${VERDICT_CLASS[v.verdict] ?? ''}`}>
                  {VERDICT_LABEL[v.verdict] ?? v.verdict}
                </span>
              )}
            </div>
            <p className="text-ink-soft">{v.hypothesis}</p>
            {v.verdictReason && <p className="text-ink-faint text-xs">{v.verdictReason}</p>}
            {v.pivotSuggestions && v.pivotSuggestions.length > 0 && (
              <ul className="text-ink-faint list-inside list-disc text-xs">
                {v.pivotSuggestions.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Projeção linear simples: ritmo atual de visitantes/dia extrapolado até o fim da janela. */
function projectSample(input: {
  startedAt: Date | null
  endsAt: Date | null
  visitors: number
  minVisitors: number
}): { warn: boolean; projected: number } {
  const { startedAt, endsAt, visitors, minVisitors } = input
  if (!startedAt || !endsAt) return { warn: false, projected: visitors }

  const elapsedMs = Date.now() - startedAt.getTime()
  const totalMs = endsAt.getTime() - startedAt.getTime()
  if (elapsedMs <= 0 || totalMs <= 0) return { warn: false, projected: visitors }

  const projected = Math.round((visitors / elapsedMs) * totalMs)
  return { warn: projected < minVisitors, projected }
}
