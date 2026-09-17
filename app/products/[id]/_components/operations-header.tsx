import Link from 'next/link'
import type { Route } from 'next'
import { ArrowRight } from '@phosphor-icons/react/dist/ssr'
import { getSystemConfig } from '@/modules/distribution'

export type OperationStep = 'channels' | 'content' | 'campaigns' | 'validation' | 'landing'

interface OperationState {
  label: string
  tone?: 'neutral' | 'active' | 'warning' | 'danger'
}

const STEPS: Array<{ key: OperationStep; label: string; path: string }> = [
  { key: 'channels', label: 'Canais', path: 'channels' },
  { key: 'content', label: 'Conteúdo', path: 'content' },
  { key: 'campaigns', label: 'Campanhas', path: 'campaigns' },
  { key: 'validation', label: 'Validação', path: 'validation' },
  { key: 'landing', label: 'Landing', path: 'landing' },
]

const STATE_CLASS: Record<NonNullable<OperationState['tone']>, string> = {
  neutral: 'tag-neutral',
  active: 'border border-ok/35 text-ok',
  warning: 'border border-warn/35 text-warn',
  danger: 'border border-danger/35 text-danger',
}

export async function OperationsHeader({
  productId,
  productName,
  currentStep,
  state,
  attention,
  nextAction,
  globalPaused = false,
}: {
  productId: string
  productName: string
  currentStep: OperationStep
  state: OperationState
  attention: string
  nextAction: { href: string; label: string }
  globalPaused?: boolean
}) {
  const globalAutomationPaused =
    globalPaused ?? (await getSystemConfig().then((config) => config.globalKillSwitch).catch(() => false))
  const stepIndex = STEPS.findIndex((step) => step.key === currentStep)
  const current = STEPS[stepIndex]!

  return (
    <header className="operations-header border-line space-y-4 border-b pb-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold">
            {productName} <span className="text-ink-faint font-normal">/ {current.label}</span>
          </h1>
          <p className="text-ink-soft mt-1 text-sm">
            Etapa {stepIndex + 1} de {STEPS.length} no fluxo de distribuição.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`tag border ${globalAutomationPaused ? 'border-danger/35 text-danger' : 'border-ok/35 text-ok'}`}>
            {globalAutomationPaused ? 'Automação global pausada' : 'Automação global ativa'}
          </span>
          <span className={`tag ${STATE_CLASS[state.tone ?? 'neutral']}`}>{state.label}</span>
        </div>
      </div>

      <nav aria-label="Fluxo de distribuição" className="overflow-x-auto pb-1">
        <ol className="flex min-w-max items-center gap-1">
          {STEPS.map((step, index) => (
            <li key={step.key} className="flex items-center gap-1">
              <Link
                href={`/products/${productId}/${step.path}` as Route}
                aria-current={step.key === currentStep ? 'step' : undefined}
                className={[
                  'inline-flex min-h-11 items-center rounded-md px-3 text-sm transition-colors',
                  step.key === currentStep
                    ? 'bg-accent-soft text-accent'
                    : 'text-ink-soft hover:bg-panel hover:text-ink',
                ].join(' ')}
              >
                {step.label}
              </Link>
              {index < STEPS.length - 1 && (
                <ArrowRight aria-hidden size={13} className="text-ink-faint" />
              )}
            </li>
          ))}
        </ol>
      </nav>

      <div className="operations-attention grid overflow-hidden rounded-md sm:grid-cols-[1fr_auto]">
        <div className="min-w-0 px-4 py-3">
          <p className="text-ink-faint text-xs font-medium">Precisa de você</p>
          <p className="mt-1 text-sm leading-snug">{attention}</p>
        </div>
        <Link
          href={nextAction.href as Route}
          className="operations-next text-accent hover:bg-accent-soft/40 inline-flex min-h-11 items-center justify-between gap-3 border-t px-4 py-3 text-sm font-medium transition-colors sm:border-t-0 sm:border-l"
        >
          {nextAction.label}
          <ArrowRight aria-hidden size={15} />
        </Link>
      </div>
    </header>
  )
}
