import Link from 'next/link'
import { requireUser } from '@/server/guard'
import { totalSpendThisMonth, activeProvider } from '@/modules/ai'
import { recentJobRuns } from '@/lib/observability/repo'
import { StatusBadge } from './_components/status-badge'
import { Sidebar } from './_components/sidebar'
import { getSidebarData } from './_components/sidebar-data'
import { SignOutButton } from './_components/auth-buttons'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const user = await requireUser()

  const [{ products, automationActive }, spend, runs] = await Promise.all([
    getSidebarData(),
    totalSpendThisMonth(),
    recentJobRuns(6),
  ])

  return (
    <div className="flex min-h-screen">
      <Sidebar
        products={products}
        currentProduct={null}
        automationActive={automationActive}
        userEmail={user.email}
        signOutSlot={<SignOutButton />}
      />
      <main className="flex-1 space-y-10 overflow-x-hidden px-8 py-8">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Painel</h1>
          <p className="text-ink-soft mt-1 text-sm">
            Fase 0. O painel completo — missões, publicações, aprendizados — chega quando houver
            conteúdo e conversões para mostrar.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
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

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="min-w-0">
            <div className="mb-2.5 flex items-baseline justify-between">
              <h2 className="text-accent text-sm font-medium">Produtos</h2>
              <Link href="/products/new" className="text-accent text-xs hover:underline">
                Adicionar SaaS
              </Link>
            </div>

            {products.length === 0 ? (
              <div className="border-line text-ink-soft rounded-md border p-8 text-center text-sm">
                Nenhum produto ainda.{' '}
                <Link href="/products/new" className="text-accent hover:underline">
                  Cole a URL de um SaaS
                </Link>{' '}
                para começar.
              </div>
            ) : (
              <div className="border-line divide-line divide-y overflow-hidden rounded-md border">
                {products.slice(0, 5).map((product) => (
                  <Link
                    key={product.id}
                    href={`/products/${product.id}`}
                    className="hover:bg-accent-soft/40 flex items-center gap-2.5 px-3.5 py-2.5 transition-colors"
                  >
                    <span className="truncate text-sm font-medium">{product.name}</span>
                    <span className="text-ink-faint truncate font-mono text-xs">
                      {product.domain}
                    </span>
                    <span className="ml-auto shrink-0">
                      <StatusBadge status={product.analysisStatus} />
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section className="min-w-0">
            <h2 className="text-accent mb-2.5 text-sm font-medium">Execuções recentes</h2>
            {runs.length === 0 ? (
              <p className="text-ink-faint text-sm">Nenhum job executado ainda.</p>
            ) : (
              <table className="table font-mono">
                <tbody>
                  {runs.map((run) => (
                    <tr key={run.id}>
                      <td className="text-ink-soft pl-0">{run.taskName}</td>
                      <td
                        className={
                          run.status === 'completed'
                            ? 'text-ok'
                            : run.status === 'failed'
                              ? 'text-danger'
                              : 'text-accent'
                        }
                      >
                        {run.status}
                      </td>
                      <td className="text-ink-faint pr-0 text-right">
                        {run.startedAt.toLocaleString('pt-BR')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      </main>
    </div>
  )
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card elev-sm">
      <div className="card-kicker">{label}</div>
      <div className="font-mono text-2xl tracking-tight">{value}</div>
      {hint && <div className="card-meta">{hint}</div>}
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
    <div className="card elev-sm">
      <div className="card-kicker">Provedor de IA</div>
      <div className="flex items-center gap-2">
        <span className={`inline-block h-2 w-2 rounded-full ${dot}`} />
        <span className="text-sm font-medium">{name}</span>
      </div>
      {provider === 'none' && (
        <div className="card-meta text-danger">
          Defina ANTHROPIC_API_KEY ou OPENAI_API_KEY no .env
        </div>
      )}
    </div>
  )
}
