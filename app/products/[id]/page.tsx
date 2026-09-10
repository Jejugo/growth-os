import { notFound } from 'next/navigation'
import { requireUser } from '@/server/guard'
import {
  findProduct,
  getCurrentProfile,
  listProfileVersions,
  COLUMN_FIELDS,
  DATA_FIELDS,
  FIELD_LABELS,
  type EditableField,
  type ProductProfile,
} from '@/modules/products'
import { spendThisMonth } from '@/modules/ai'
import { recentDecisions } from '@/lib/observability/repo'
import { listStageEvents, listValidations } from '@/modules/validation'
import { StatusBadge } from '../../_components/status-badge'
import { ProfileField } from './profile-field'
import { reanalyzeAction } from '../../actions/products'
import { AnalysisPoller } from './_components/analysis-poller'
import { DeleteProductButton } from './_components/delete-product-button'
import { ProductStageTimeline } from './_components/product-stage-timeline'

export const dynamic = 'force-dynamic'

/** Campos estruturados que ainda não têm edição textual nesta fase. */
const READ_ONLY_FIELDS = new Set<EditableField>(['pricingTiers'])

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser()
  const { id } = await params

  const product = await findProduct(id)
  if (!product) notFound()

  const [profile, versions, spend, decisions, stageEvents, validationHistory] = await Promise.all([
    getCurrentProfile(id),
    listProfileVersions(id),
    spendThisMonth(id),
    recentDecisions(id, 5),
    listStageEvents(id),
    listValidations(id),
  ])

  return (
    <div className="space-y-8">
      <ProductStageTimeline
        productId={id}
        stage={product.stage}
        events={stageEvents}
        latestValidation={validationHistory[0] ?? null}
      />

      <header className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <h1 className="truncate text-xl font-semibold tracking-tight">{product.name}</h1>
            <StatusBadge status={product.analysisStatus} />
          </div>
          {product.url ? (
            <a
              href={product.url}
              target="_blank"
              rel="noreferrer noopener"
              className="text-ink-faint hover:text-accent font-mono text-xs transition-colors"
            >
              {product.url}
            </a>
          ) : (
            <span className="text-ink-faint font-mono text-xs">ainda sem site — veja o estágio acima</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {product.url && (
            <form action={reanalyzeAction}>
              <input type="hidden" name="productId" value={product.id} />
              <button
                type="submit"
                disabled={product.analysisStatus === 'running'}
                className="btn btn-secondary"
              >
                Reanalisar
              </button>
            </form>
          )}
          <DeleteProductButton productId={product.id} productName={product.name} />
        </div>
      </header>

      {product.analysisStatus === 'failed' && product.analysisError && (
        <div className="border-danger/30 bg-danger-soft rounded-md border p-4">
          <p className="text-danger text-sm font-medium">A análise falhou</p>
          <p className="text-ink-soft mt-1 font-mono text-xs">{product.analysisError}</p>
        </div>
      )}

      <AnalysisPoller isRunning={product.analysisStatus === 'running'} />

      {product.analysisStatus === 'running' && (
        <div className="border-accent/30 bg-accent-soft flex items-center gap-3 rounded-md border p-4 text-sm">
          <span className="border-accent/40 h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-t-transparent" />
          Analisando o site… isso leva alguns minutos.
        </div>
      )}

      {profile?.lowConfidence && (
        <div className="border-warn/30 bg-warn-soft rounded-md border p-4">
          <p className="text-sm font-medium">Confiança baixa neste perfil</p>
          <p className="text-ink-soft mt-1 text-sm">
            O site trouxe pouco texto (comum em SPA sem SSR) ou o modelo declarou baixa confiança.
            Vale revisar e corrigir os campos à mão antes de usar este perfil para qualquer coisa.
          </p>
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        {!profile ? (
          <div className="border-line text-ink-soft rounded-md border border-dashed p-10 text-center text-sm">
            Ainda não há perfil. {product.analysisStatus === 'never' && 'Rode uma análise.'}
          </div>
        ) : (
          <div className="border-line overflow-hidden rounded-md border">
            {COLUMN_FIELDS.map((field) => (
              <ProfileField
                key={field}
                productId={product.id}
                field={field}
                label={FIELD_LABELS[field]}
                value={profile[field]}
                locked={profile.lockedFields.includes(field)}
                confidence={profile.confidence?.[field]}
              />
            ))}
            {DATA_FIELDS.filter((f) => !READ_ONLY_FIELDS.has(f)).map((field) => (
              <ProfileField
                key={field}
                productId={product.id}
                field={field}
                label={FIELD_LABELS[field]}
                value={profile.data[field] as string | string[] | null}
                locked={profile.lockedFields.includes(field)}
                confidence={profile.confidence?.[field]}
              />
            ))}

            {profile.data.pricingTiers.length > 0 && (
              <div className="grid grid-cols-[170px_minmax(0,1fr)] gap-3.5 px-4 py-3">
                <div className="text-[12.5px]">{FIELD_LABELS.pricingTiers}</div>
                <div className="grid gap-1.5">
                  {profile.data.pricingTiers.map((tier, i) => (
                    <div
                      key={`${tier.name}-${i}`}
                      className="flex items-baseline gap-2.5 text-[13px]"
                    >
                      <span className="w-[74px] font-medium">{tier.name}</span>
                      <span className="font-mono">{tier.price}</span>
                      {tier.notes && (
                        <span className="text-ink-faint truncate text-[11.5px]">{tier.notes}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-col gap-4.5">
            <div>
              <h2 className="text-accent mb-2.5 text-sm font-medium">Versões do perfil</h2>
              {versions.length === 0 ? (
                <p className="text-ink-faint text-sm">Nenhuma ainda.</p>
              ) : (
                <div className="grid gap-2 text-xs">
                  {versions.map((version, index) => {
                    const previous = versions[index + 1]
                    const changed = previous ? changedFields(previous, version) : []
                    return (
                      <div key={version.id}>
                        <div className="flex items-baseline gap-2 font-mono">
                          <span className={version.isCurrent ? 'text-accent' : 'text-ink-faint'}>
                            v{version.version}
                          </span>
                          <span className="text-ink-faint">{version.source}</span>
                          <span className="text-ink-faint ml-auto">
                            {version.createdAt.toLocaleString('pt-BR')}
                          </span>
                        </div>
                        {previous && (
                          <p className="text-ink-faint border-line mt-1 border-l pl-1.5 text-[11.5px]">
                            {changed.length === 0
                              ? 'sem mudanças de conteúdo'
                              : `alterou: ${changed.map((f) => FIELD_LABELS[f]).join(', ')}`}
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <hr className="hr" />

            <div>
              <h2 className="text-accent mb-2.5 text-sm font-medium">Decisões registradas</h2>
              {decisions.length === 0 ? (
                <p className="text-ink-faint text-sm">Nenhuma ainda.</p>
              ) : (
                <div className="grid gap-2.5 text-xs">
                  {decisions.map((decision) => (
                    <div key={decision.id}>
                      <div className="flex items-center gap-2 font-mono">
                        <span className="text-ink-faint">{decision.actor}</span>
                        <span
                          className={decision.decision === 'NO_ACTION' ? 'text-ink-faint' : 'text-ok'}
                        >
                          {decision.decision}
                        </span>
                      </div>
                      <p className="text-ink-soft mt-0.5 leading-relaxed">{decision.rationale}</p>
                    </div>
                  ))}
                </div>
              )}
              <div className="border-line mt-3.5 flex justify-between border-t pt-3 font-mono text-[11.5px]">
                <span className="text-ink-faint">custo de IA no mês</span>
                <span>US$ {spend.toFixed(4)}</span>
              </div>
            </div>
          </div>
        </div>
    </div>
  )
}

/** Diff de versões no nível de campo — suficiente para auditar sem um visualizador. */
function changedFields(before: ProductProfile, after: ProductProfile): EditableField[] {
  const changed: EditableField[] = []

  for (const field of COLUMN_FIELDS) {
    if (before[field] !== after[field]) changed.push(field)
  }
  for (const field of DATA_FIELDS) {
    if (JSON.stringify(before.data[field]) !== JSON.stringify(after.data[field])) {
      changed.push(field)
    }
  }

  return changed
}
