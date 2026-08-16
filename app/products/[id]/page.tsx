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
import { StatusBadge } from '../../_components/status-badge'
import { ProfileField } from './profile-field'
import { reanalyzeAction } from '../../actions/products'
import { ProductNav } from './_components/product-nav'
import { AnalysisPoller } from './_components/analysis-poller'

export const dynamic = 'force-dynamic'

/** Campos estruturados que ainda não têm edição textual nesta fase. */
const READ_ONLY_FIELDS = new Set<EditableField>(['pricingTiers'])

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser()
  const { id } = await params

  const product = await findProduct(id)
  if (!product) notFound()

  const [profile, versions, spend, decisions] = await Promise.all([
    getCurrentProfile(id),
    listProfileVersions(id),
    spendThisMonth(id),
    recentDecisions(id, 5),
  ])

  return (
    <div className="space-y-8">
      <ProductNav productId={id} active="profile" />

      <header className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <h1 className="truncate text-xl font-semibold tracking-tight">{product.name}</h1>
            <StatusBadge status={product.analysisStatus} />
          </div>
          <a
            href={product.url}
            target="_blank"
            rel="noreferrer noopener"
            className="text-ink-faint hover:text-accent font-mono text-xs transition-colors"
          >
            {product.url}
          </a>
        </div>

        <form action={reanalyzeAction}>
          <input type="hidden" name="productId" value={product.id} />
          <button
            type="submit"
            disabled={product.analysisStatus === 'running'}
            className="border-line hover:bg-accent-soft rounded-lg border px-3 py-1.5 text-sm transition-colors disabled:opacity-50"
          >
            Reanalisar
          </button>
        </form>
      </header>

      {product.analysisStatus === 'failed' && product.analysisError && (
        <div className="border-danger/30 bg-danger/5 rounded-lg border p-4">
          <p className="text-danger text-sm font-medium">A análise falhou</p>
          <p className="text-ink-soft mt-1 font-mono text-xs">{product.analysisError}</p>
        </div>
      )}

      <AnalysisPoller isRunning={product.analysisStatus === 'running'} />

      {product.analysisStatus === 'running' && (
        <div className="border-accent/30 bg-accent-soft flex items-center gap-3 rounded-lg border p-4 text-sm">
          <span className="border-accent/40 h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-t-transparent" />
          Analisando o site… isso leva alguns minutos.
        </div>
      )}

      {profile?.lowConfidence && (
        <div className="border-warn/30 bg-warn-soft rounded-lg border p-4">
          <p className="text-sm font-medium">Confiança baixa neste perfil</p>
          <p className="text-ink-soft mt-1 text-sm">
            O site trouxe pouco texto (comum em SPA sem SSR) ou o modelo declarou baixa confiança.
            Vale revisar e corrigir os campos à mão antes de usar este perfil para qualquer coisa.
          </p>
        </div>
      )}

      {!profile ? (
        <div className="panel text-ink-soft p-10 text-center text-sm">
          Ainda não há perfil. {product.analysisStatus === 'never' && 'Rode uma análise.'}
        </div>
      ) : (
        <>
          <section className="panel px-5 py-1">
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
          </section>

          <section className="panel px-5 py-1">
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
          </section>

          {profile.data.pricingTiers.length > 0 && (
            <section>
              <h2 className="label-xs mb-2">{FIELD_LABELS.pricingTiers}</h2>
              <ul className="panel divide-line divide-y">
                {profile.data.pricingTiers.map((tier, i) => (
                  <li key={`${tier.name}-${i}`} className="flex items-baseline gap-3 px-4 py-2.5">
                    <span className="text-sm font-medium">{tier.name}</span>
                    <span className="font-mono text-sm">{tier.price}</span>
                    {tier.notes && (
                      <span className="text-ink-faint truncate text-xs">{tier.notes}</span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <section className="grid gap-8 sm:grid-cols-2">
        <div>
          <h2 className="label-xs mb-2">Versões do perfil</h2>
          {versions.length === 0 ? (
            <p className="text-ink-faint text-sm">Nenhuma ainda.</p>
          ) : (
            <ul className="panel divide-line divide-y text-xs">
              {versions.map((version, index) => {
                const previous = versions[index + 1]
                const changed = previous ? changedFields(previous, version) : []
                return (
                  <li key={version.id} className="px-4 py-2.5">
                    <div className="flex items-center gap-2 font-mono">
                      <span className={version.isCurrent ? 'text-accent' : 'text-ink-soft'}>
                        v{version.version}
                      </span>
                      <span className="text-ink-faint">{version.source}</span>
                      <span className="text-ink-faint ml-auto">
                        {version.createdAt.toLocaleString('pt-BR')}
                      </span>
                    </div>
                    {previous && (
                      <p className="text-ink-faint mt-1">
                        {changed.length === 0
                          ? 'sem mudanças de conteúdo'
                          : `alterou: ${changed.map((f) => FIELD_LABELS[f]).join(', ')}`}
                      </p>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div>
          <h2 className="label-xs mb-2">Decisões registradas</h2>
          {decisions.length === 0 ? (
            <p className="text-ink-faint text-sm">Nenhuma ainda.</p>
          ) : (
            <ul className="panel divide-line divide-y text-xs">
              {decisions.map((decision) => (
                <li key={decision.id} className="px-4 py-2.5">
                  <div className="flex items-center gap-2 font-mono">
                    <span className="text-ink-soft">{decision.actor}</span>
                    <span
                      className={decision.decision === 'NO_ACTION' ? 'text-ink-faint' : 'text-ok'}
                    >
                      {decision.decision}
                    </span>
                  </div>
                  <p className="text-ink-soft mt-1 leading-relaxed">{decision.rationale}</p>
                </li>
              ))}
            </ul>
          )}
          <p className="text-ink-faint mt-3 font-mono text-xs">
            custo de IA no mês: US$ {spend.toFixed(4)}
          </p>
        </div>
      </section>
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
