import Link from 'next/link'
import { requireUser } from '@/server/guard'
import { listProducts } from '@/modules/products'
import { totalSpendThisMonth, activeProvider } from '@/modules/ai'
import { recentJobRuns } from '@/lib/observability/repo'
import { StatusBadge } from './_components/status-badge'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  await requireUser()

  const [products, spend, runs] = await Promise.all([
    listProducts(),
    totalSpendThisMonth(),
    recentJobRuns(6),
  ])

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Painel</h1>
        <p className="text-ink-soft mt-1 text-sm">
          Fase 0. O painel completo — missões, publicações, aprendizados — chega quando houver
          conteúdo e conversões para mostrar.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Metric label="Produtos" value={String(products.length)} />
        <Metric
          label="Custo de IA no mês"
          value={`US$ ${spend.costUsd.toFixed(2)}`}
          hint={`${spend.calls} chamadas`}
        />
        <Metric
          label="Analisados"
          value={String(products.filter((p) => p.analysisStatus === 'ok').length)}
          hint={`de ${products.length}`}
        />
        <AIProviderMetric provider={activeProvider()} />
      </div>

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="label-xs">Produtos</h2>
          <Link href="/products/new" className="text-accent text-sm hover:underline">
            Adicionar SaaS
          </Link>
        </div>

        {products.length === 0 ? (
          <div className="panel text-ink-soft p-8 text-center text-sm">
            Nenhum produto ainda.{' '}
            <Link href="/products/new" className="text-accent hover:underline">
              Cole a URL de um SaaS
            </Link>{' '}
            para começar.
          </div>
        ) : (
          <ul className="panel divide-line divide-y">
            {products.slice(0, 5).map((product) => (
              <li key={product.id}>
                <Link
                  href={`/products/${product.id}`}
                  className="hover:bg-accent-soft/40 flex items-center gap-3 px-4 py-3 transition-colors"
                >
                  <span className="truncate text-sm font-medium">{product.name}</span>
                  <span className="text-ink-faint truncate font-mono text-xs">
                    {product.domain}
                  </span>
                  <span className="ml-auto shrink-0">
                    <StatusBadge status={product.analysisStatus} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="label-xs mb-3">Execuções recentes</h2>
        {runs.length === 0 ? (
          <p className="text-ink-faint text-sm">Nenhum job executado ainda.</p>
        ) : (
          <ul className="panel divide-line divide-y font-mono text-xs">
            {runs.map((run) => (
              <li key={run.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="text-ink-soft">{run.taskName}</span>
                <span
                  className={
                    run.status === 'completed'
                      ? 'text-ok'
                      : run.status === 'failed'
                        ? 'text-danger'
                        : 'text-ink-faint'
                  }
                >
                  {run.status}
                </span>
                <span className="text-ink-faint ml-auto">
                  {run.startedAt.toLocaleString('pt-BR')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="panel p-4">
      <div className="label-xs">{label}</div>
      <div className="mt-1.5 font-mono text-2xl tracking-tight">{value}</div>
      {hint && <div className="text-ink-faint mt-0.5 text-xs">{hint}</div>}
    </div>
  )
}

const PROVIDER_LABELS = {
  anthropic: { name: 'Claude (Anthropic)', dot: 'bg-ok' },
  openai: { name: 'GPT-4o (OpenAI)', dot: 'bg-ok' },
  none: { name: 'Não configurado', dot: 'bg-danger' },
} as const

function AIProviderMetric({ provider }: { provider: 'anthropic' | 'openai' | 'none' }) {
  const { name, dot } = PROVIDER_LABELS[provider]
  return (
    <div className="panel p-4">
      <div className="label-xs">Provedor de IA</div>
      <div className="mt-1.5 flex items-center gap-2">
        <span className={`inline-block h-2 w-2 rounded-full ${dot}`} />
        <span className="text-sm font-medium">{name}</span>
      </div>
      {provider === 'none' && (
        <div className="text-danger mt-0.5 text-xs">
          Defina ANTHROPIC_API_KEY ou OPENAI_API_KEY no .env
        </div>
      )}
    </div>
  )
}
