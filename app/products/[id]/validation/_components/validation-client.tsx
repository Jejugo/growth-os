'use client'

import { useActionState, useState, useRef, useEffect } from 'react'
import { CaretDown } from '@phosphor-icons/react'
import { useFormStatus } from 'react-dom'
import { Spinner } from '../../../../_components/spinner'
import {
  startValidationAction,
  abortValidationAction,
  generateMoreValidationContentAction,
  recordSignalAction,
  concludeDueValidationsAction,
  type ActionState,
} from '../../../../actions/validation'
import type { ProductStage } from '@/modules/products'
import type { ProductBrief, Validation, LandingPage, WaitlistSignup } from '@/modules/validation'
import { AnalysisPoller } from '../../_components/analysis-poller'
import { shortDeployUrl } from '../../landing/_lib/deploy-url'

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
  waitlistSignups,
  variants,
  landingPage,
}: {
  productId: string
  stage: ProductStage
  brief: ProductBrief | null
  running: Validation | null
  history: Validation[]
  liveMetrics: LiveMetrics | null
  waitlistSignups: WaitlistSignup[]
  variants: VariantRow[]
  landingPage: LandingPage | null
}) {
  if (!brief) {
    return (
      <div className="border-line text-ink-soft rounded-md border border-dashed p-8 text-center text-sm">
        Este produto não tem brief de ideia — a validação da fase 4.5 é para produtos cadastrados
        como ideia, sem site ainda.
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <AnalysisPoller isRunning={landingPage?.status === 'generating'} />
      <BriefCard brief={brief} />

      {running ? (
        <RunningValidation
          productId={productId}
          validation={running}
          metrics={liveMetrics}
          waitlistSignups={waitlistSignups}
          variants={variants}
        />
      ) : (
        (stage === 'idea' || stage === 'validating') && (
          <StartValidationForm productId={productId} landingPage={landingPage} />
        )
      )}

      {history.length > 0 && <HistorySection history={history} />}
    </div>
  )
}

function BriefCard({ brief }: { brief: ProductBrief }) {
  return (
    <details className="group border-line border-b py-3">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 marker:content-none [&::-webkit-details-marker]:hidden">
        <CaretDown size={12} className="text-ink-faint flex-none transition-transform group-open:rotate-180" />
        <span className="card-kicker flex-none">Brief</span>
        <span className="truncate text-sm">{brief.problem}</span>
      </summary>
      <div className="mt-1 space-y-2 pt-3">
        <p className="text-sm"><span className="text-ink-faint">Problema: </span>{brief.problem}</p>
        <p className="text-sm"><span className="text-ink-faint">Audiência: </span>{brief.audience}</p>
        <p className="text-sm"><span className="text-ink-faint">Solução: </span>{brief.solutionSketch}</p>
        <p className="text-sm font-medium">
          <span className="text-ink-faint font-normal">Hipótese mais arriscada: </span>
          {brief.riskiestAssumption}
        </p>
      </div>
    </details>
  )
}

function StartValidationForm({
  productId,
  landingPage,
}: {
  productId: string
  landingPage: LandingPage | null
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(startValidationAction, {})
  const landingUrlRef = useRef<HTMLInputElement>(null)

  const status = landingPage?.status
  const slug = landingPage?.slug
  const deployUrl = landingPage?.deployUrl

  useEffect(() => {
    const url = status === 'ready' && slug ? shortDeployUrl({ slug, deployUrl: deployUrl ?? null }) : null
    if (url && landingUrlRef.current) {
      landingUrlRef.current.value = url
    }
  }, [status, slug, deployUrl])

  return (
    <div className="card" style={{ padding: '1rem', gap: '1rem' }}>
      <h2 className="card-title">Iniciar validação</h2>

      <form action={action} className="space-y-4">
        <input type="hidden" name="productId" value={productId} />

        <div className="field">
          <label className="flex items-center gap-2">
            Landing page (waitlist) *
            <InfoIcon tooltip="URL da página que receberá o tráfego. Pode ser gerada automaticamente na aba Landing, ou você cola a sua própria." />
          </label>
          <input
            ref={landingUrlRef}
            name="landingUrl"
            required
            placeholder="https://minhaideia.com"
            className="input"
          />
          <p className="text-ink-faint mt-1 text-xs">
            <a href={`/products/${productId}/landing`} className="text-accent hover:underline">
              Gerar landing automaticamente →
            </a>{' '}
            ou cole a sua própria acima.
          </p>
        </div>

        <details className="group">
          <summary className="text-ink-soft flex cursor-pointer list-none items-center gap-2 text-sm marker:content-none [&::-webkit-details-marker]:hidden">
            <CaretDown size={12} className="text-ink-faint flex-none transition-transform group-open:rotate-180" />
            Configurações avançadas
            <span className="text-ink-faint font-mono text-xs">
              (padrão: 14 dias · 300 visitantes · 100 inscrições · 4% · 5 sinais fortes)
            </span>
          </summary>

          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
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
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field
              label="Mín. sinais fortes"
              name="minStrongSignals"
              defaultValue={5}
              help="Comentários, retweets, replies positivos ou outras interações diretas que indicam real interesse."
            />
          </div>
          <p className="text-ink-faint mt-2 text-xs">
            Os limiares ficam travados assim que a validação começa a rodar — mudar exige abortar e
            recomeçar.
          </p>
        </details>

        <ActionError error={state.error} productId={productId} />
        {state.success && <p className="text-ok text-xs">{state.success}</p>}

        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending && <Spinner />}
          {pending ? 'Iniciando…' : 'Iniciar validação'}
        </button>
      </form>
    </div>
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
    <div className="field">
      <label className="flex items-center gap-1">
        {label}
        {help && <InfoIcon tooltip={help} />}
      </label>
      <input
        name={name}
        type="number"
        step={step}
        defaultValue={defaultValue}
        placeholder={String(defaultValue)}
        className="input"
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
        className="bg-line text-ink-faint hover:bg-accent inline-flex size-7 items-center justify-center rounded-full transition-colors hover:text-white"
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
          className="border-line bg-panel text-ink pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-48 -translate-x-1/2 transform rounded-md border p-2 text-xs shadow-lg"
        >
          {tooltip}
          <div
            className="border-t-panel absolute top-full left-1/2 -translate-x-1/2 transform border-4 border-transparent"
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
  waitlistSignups,
  variants,
}: {
  productId: string
  validation: Validation
  metrics: LiveMetrics | null
  waitlistSignups: WaitlistSignup[]
  variants: VariantRow[]
}) {
  const [abortState, abortAction, abortPending] = useActionState<ActionState, FormData>(
    abortValidationAction,
    {},
  )
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
    <section className="surface-elevated space-y-5 rounded-lg p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="card-title">Validação em andamento</h2>
          <p className="text-ink-soft mt-1 text-sm">{validation.hypothesis}</p>
        </div>
        <button
          onClick={() => setShowAbort((v) => !v)}
          className="btn btn-secondary"
          style={{ color: 'var(--color-danger)', borderColor: 'color-mix(in srgb, var(--color-danger) 40%, transparent)' }}
        >
          Abortar
        </button>
      </div>

      <div className="text-ink-faint flex flex-wrap gap-3 font-mono text-xs">
        <span>início: {startedAt?.toLocaleDateString('pt-BR')}</span>
        <span>fim: {endsAt?.toLocaleDateString('pt-BR')}</span>
        <span>landing: {validation.landingUrl}</span>
      </div>

      {showAbort && (
        <form action={abortAction} className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input type="hidden" name="productId" value={productId} />
          <input name="reason" required placeholder="Motivo do abandono" className="input flex-1" />
          <button
            type="submit"
            disabled={abortPending}
            className="btn btn-ghost"
            style={{ color: 'var(--color-danger)' }}
          >
            {abortPending && <Spinner size="xs" className="text-danger" />}
            {abortPending ? 'Abortando…' : 'Confirmar'}
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

      {waitlistSignups.length > 0 && (
        <details className="border-line group rounded-md border">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium marker:content-none [&::-webkit-details-marker]:hidden">
            <CaretDown size={12} className="text-ink-faint flex-none transition-transform group-open:rotate-180" />
            Inscritos ({waitlistSignups.length})
          </summary>
          <div className="border-line divide-line max-h-64 divide-y overflow-y-auto border-t">
            {waitlistSignups.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                <span className="font-mono text-xs">{s.email}</span>
                <span className="text-ink-faint shrink-0 font-mono text-xs">
                  {s.createdAt.toLocaleString('pt-BR')}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}

      {variants.length > 0 && (
        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 className="text-accent text-sm font-medium">Ângulos testados</h3>
            <GenerateMoreContentButton productId={productId} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {variants.map((v) => (
              <div key={v.variantId} className="card">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-medium">{v.label}</span>
                  <span className="text-ink-soft text-sm">{v.name}</span>
                </div>
                {v.description && <p className="card-body">{v.description}</p>}
                <div className="card-meta">
                  <span>{v.clicks} cliques</span>
                  <span>·</span>
                  <span>{v.signups} inscrições</span>
                  <span>·</span>
                  <span>{v.activations + v.paid} fortes</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <ManualSignalForm productId={productId} />

      <form action={concludeDueValidationsAction}>
        <ConcludeDueButton />
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
  const progress =
    typeof value === 'number' && typeof threshold === 'number' && threshold > 0
      ? Math.min(100, Math.round((value / threshold) * 100))
      : null

  return (
    <div className="card elev-sm">
      <div className="card-kicker">{label}</div>
      <p className={`font-mono text-2xl tracking-tight ${numericOk ? 'text-ok' : ''}`}>{value}</p>
      {progress !== null && (
        <div className="bg-line/40 h-1 overflow-hidden rounded-full">
          <div
            className={`h-full rounded-full ${numericOk ? 'bg-ok' : 'bg-accent'}`}
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
      <p className="card-meta">mín.: {threshold}</p>
    </div>
  )
}

function ManualSignalForm({ productId }: { productId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(recordSignalAction, {})

  return (
    <form action={action} className="border-line flex flex-wrap items-end gap-2 border-t pt-4">
      <input type="hidden" name="productId" value={productId} />
      <div className="field min-w-[160px] flex-1">
        <label>Registrar sinal forte</label>
        <select name="kind" className="input">
          <option value="activation">Conversa aceita / pesquisa respondida</option>
          <option value="paid">Pré-venda / depósito / carta de intenção</option>
        </select>
      </div>
      <input name="note" placeholder="Nota (opcional)" className="input min-w-[160px] flex-[2]" />
      <button type="submit" disabled={pending} className="btn btn-primary">
        {pending && <Spinner size="xs" />}
        {pending ? 'Registrando…' : 'Registrar'}
      </button>
      {state.error && <p className="text-danger w-full text-xs">{state.error}</p>}
    </form>
  )
}

function GenerateMoreContentButton({ productId }: { productId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    generateMoreValidationContentAction,
    {},
  )

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="productId" value={productId} />
      <button type="submit" disabled={pending} className="btn btn-secondary">
        {pending && <Spinner size="xs" />}
        {pending ? 'Gerando…' : 'Gerar mais posts'}
      </button>
      <ActionError error={state.error} productId={productId} />
      {state.success && <p className="text-ok text-xs">{state.success}</p>}
    </form>
  )
}

/**
 * TODO(B6): as actions passam a devolver esta mensagem antes de criar/disparar qualquer validação
 * quando não houver política ativa.
 */
function ActionError({ error, productId }: { error?: string; productId: string }) {
  if (!error) return null

  const missingPolicy = error.startsWith('Nenhum canal com política ativa')

  return (
    <p className="text-danger text-xs" role="alert">
      {error}
      {missingPolicy && (
        <>
          {' '}
          <a href={`/products/${productId}/channels`} className="text-accent hover:underline">
            Configurar canais →
          </a>
        </>
      )}
    </p>
  )
}

function ConcludeDueButton() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="btn btn-ghost">
      {pending && <Spinner size="xs" />}
      {pending ? 'Verificando…' : 'Verificar validações vencidas agora'}
    </button>
  )
}

function HistorySection({ history }: { history: Validation[] }) {
  return (
    <section>
      <h2 className="text-accent mb-2.5 text-sm font-medium">Histórico de validações</h2>
      <div className="border-line divide-line divide-y rounded-md border text-sm">
        {history.map((v) => (
          <details key={v.id} className="group px-4 py-3">
            <summary className="flex cursor-pointer list-none items-center gap-2 marker:content-none [&::-webkit-details-marker]:hidden">
              <CaretDown size={12} className="text-ink-faint flex-none transition-transform group-open:rotate-180" />
              <span className="text-ink-faint font-mono text-xs">
                {new Date(v.createdAt).toLocaleDateString('pt-BR')}
              </span>
              <span className="text-ink-faint text-xs">{v.status}</span>
              {v.verdict && (
                <span className={`tag font-mono ${VERDICT_CLASS[v.verdict] ?? 'text-ink-faint'}`}>
                  {VERDICT_LABEL[v.verdict] ?? v.verdict}
                </span>
              )}
              <span className="text-ink-soft ml-1 truncate">{v.hypothesis}</span>
            </summary>
            <div className="mt-2 space-y-1 pl-5">
              {v.verdictReason && <p className="text-ink-faint text-xs">{v.verdictReason}</p>}
              {v.pivotSuggestions && v.pivotSuggestions.length > 0 && (
                <ul className="text-ink-faint list-inside list-disc text-xs">
                  {v.pivotSuggestions.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              )}
            </div>
          </details>
        ))}
      </div>
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
