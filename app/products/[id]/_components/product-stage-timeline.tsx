import { markLaunchedAction } from '../../../actions/validation'
import { MarkLaunchedButton } from './mark-launched-button'
import type { ProductStage } from '@/modules/products'
import type { ProductStageEvent, Validation } from '@/modules/validation'

const STAGES: ProductStage[] = ['idea', 'validating', 'building', 'launched']

const STAGE_LABELS: Record<ProductStage, string> = {
  idea: 'Ideia',
  validating: 'Validação',
  building: 'Construção',
  launched: 'Lançado',
}

export function ProductStageTimeline({
  productId,
  stage,
  events,
  latestValidation,
}: {
  productId: string
  stage: ProductStage
  events: ProductStageEvent[]
  latestValidation: Validation | null
}) {
  const currentIndex = STAGES.indexOf(stage)
  const killed = stage === 'validating' && latestValidation?.status === 'concluded' && latestValidation.verdict === 'kill'

  return (
    <section className="border-line rounded-md border p-4">
      <div className="flex items-center gap-1 overflow-x-auto">
        {STAGES.map((s, i) => {
          const event = [...events].reverse().find((e) => e.toStage === s)
          const isCurrent = i === currentIndex && !killed
          const isPast = i < currentIndex
          const isFuture = i > currentIndex

          return (
            <div key={s} className="flex flex-1 items-center last:flex-none">
              <div className="flex flex-col items-center gap-1 whitespace-nowrap">
                <div
                  className={[
                    'flex h-[26px] w-[26px] items-center justify-center rounded-full font-mono text-[11px]',
                    isCurrent
                      ? 'bg-accent text-surface font-medium'
                      : isPast
                        ? 'bg-ok/20 text-ok'
                        : 'bg-line/40 text-ink-faint',
                  ].join(' ')}
                >
                  {i + 1}
                </div>
                <span className={isFuture ? 'text-ink-faint text-xs' : 'text-xs font-medium'}>
                  {STAGE_LABELS[s]}
                </span>
                <span className="text-ink-faint font-mono text-[10px]">
                  {event ? event.occurredAt.toLocaleDateString('pt-BR') : isFuture ? '—' : ''}
                </span>
              </div>
              {i < STAGES.length - 1 && (
                <div className={`mx-2 h-px flex-1 ${isPast ? 'bg-ok/40' : 'bg-line'}`} />
              )}
            </div>
          )
        })}
      </div>

      {killed && (
        <div className="border-danger/30 bg-danger-soft mt-4 rounded-md border p-3">
          <p className="text-danger text-sm font-medium">Descontinuado na validação</p>
          {latestValidation?.verdictReason && (
            <p className="text-ink-soft mt-1 text-sm">{latestValidation.verdictReason}</p>
          )}
        </div>
      )}

      {stage === 'building' && (
        <form action={markLaunchedAction} className="mt-4">
          <input type="hidden" name="productId" value={productId} />
          <MarkLaunchedButton />
          <p className="text-ink-faint mt-1 text-xs">
            Geração de conteúdo pausada durante a construção. Isto não é detectado automaticamente.
          </p>
        </form>
      )}
    </section>
  )
}
