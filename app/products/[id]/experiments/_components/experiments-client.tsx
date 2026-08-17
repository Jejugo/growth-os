'use client'

import { useActionState, useState } from 'react'
import {
  createExperimentAction,
  startExperimentAction,
  abandonExperimentAction,
} from '../../../../actions/analytics'
import type { experiments, experimentVariants } from '@/modules/content/schema'

type Experiment = typeof experiments.$inferSelect & {
  variants: (typeof experimentVariants.$inferSelect)[]
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Rascunho',
  running: 'Em andamento',
  concluded: 'Concluído',
  abandoned: 'Abandonado',
}

const STATUS_CLASS: Record<string, string> = {
  draft: 'text-ink-faint',
  running: 'text-accent',
  concluded: 'text-ok',
  abandoned: 'text-danger',
}

const METRIC_LABEL: Record<string, string> = {
  paid: 'Pagos',
  activation: 'Ativações',
  signup: 'Signups',
  qualified_visit: 'Visitas qualificadas',
  engagement: 'Engajamento',
}

export function ExperimentsClient({
  productId,
  experiments,
}: {
  productId: string
  experiments: Experiment[]
}) {
  const [showForm, setShowForm] = useState(false)
  const [createState, createAction, createPending] = useActionState(
    createExperimentAction,
    {} as { error?: string; success?: string; experimentId?: string },
  )

  const active = experiments.filter((e) => e.status === 'running')
  const drafts = experiments.filter((e) => e.status === 'draft')
  const concluded = experiments.filter((e) => e.status === 'concluded' || e.status === 'abandoned')

  return (
    <div className="space-y-8">
      {/* Botão de criar */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Experimentos A/B</h2>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90"
        >
          {showForm ? 'Cancelar' : '+ Novo experimento'}
        </button>
      </div>

      {/* Formulário de criação */}
      {showForm && (
        <form action={createAction} className="panel space-y-4 rounded-xl p-5">
          <input type="hidden" name="productId" value={productId} />
          <h3 className="font-medium">Novo experimento</h3>

          <div>
            <label className="label-xs mb-1 block">Nome *</label>
            <input
              name="name"
              required
              className="w-full rounded-lg border border-line bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent"
              placeholder="Ex: Ângulo problem vs. solution"
            />
          </div>

          <div>
            <label className="label-xs mb-1 block">Hipótese</label>
            <textarea
              name="hypothesis"
              rows={2}
              className="w-full resize-none rounded-lg border border-line bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent"
              placeholder="Ex: Posts com ângulo 'problem' convertem mais que 'solution'"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label-xs mb-1 block">Dimensão</label>
              <select
                name="dimension"
                className="w-full rounded-lg border border-line bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent"
              >
                <option value="angle">Ângulo</option>
                <option value="hook">Hook</option>
                <option value="cta">CTA</option>
                <option value="audience">Audiência</option>
                <option value="channel">Canal</option>
                <option value="posting_time">Horário</option>
                <option value="format">Formato</option>
                <option value="topic">Tópico</option>
              </select>
            </div>

            <div>
              <label className="label-xs mb-1 block">Métrica primária</label>
              <select
                name="primaryMetric"
                className="w-full rounded-lg border border-line bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent"
              >
                <option value="signup">Signups</option>
                <option value="paid">Pagos</option>
                <option value="activation">Ativações</option>
                <option value="qualified_visit">Visitas qualificadas</option>
              </select>
            </div>
          </div>

          <div>
            <label className="label-xs mb-1 block">Amostra mínima por variante</label>
            <input
              name="minSamplePerVariant"
              type="number"
              min={10}
              defaultValue={100}
              className="w-full rounded-lg border border-line bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>

          {createState.error && (
            <p className="text-xs text-danger">{createState.error}</p>
          )}

          <button
            type="submit"
            disabled={createPending}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50"
          >
            {createPending ? 'Criando…' : 'Criar experimento'}
          </button>
        </form>
      )}

      {/* Em andamento */}
      {active.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-medium text-ink-soft">Em andamento</h3>
          <div className="space-y-4">
            {active.map((exp) => (
              <ExperimentCard key={exp.id} experiment={exp} productId={productId} />
            ))}
          </div>
        </section>
      )}

      {/* Rascunhos */}
      {drafts.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-medium text-ink-soft">Rascunhos</h3>
          <div className="space-y-4">
            {drafts.map((exp) => (
              <ExperimentCard key={exp.id} experiment={exp} productId={productId} />
            ))}
          </div>
        </section>
      )}

      {/* Histórico */}
      {concluded.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-medium text-ink-soft">Histórico</h3>
          <div className="space-y-4 opacity-70">
            {concluded.map((exp) => (
              <ExperimentCard key={exp.id} experiment={exp} productId={productId} />
            ))}
          </div>
        </section>
      )}

      {experiments.length === 0 && !showForm && (
        <div className="panel text-ink-soft p-8 text-center text-sm">
          Nenhum experimento ainda. Crie seu primeiro experimento A/B para comparar variantes de conteúdo.
        </div>
      )}
    </div>
  )
}

function ExperimentCard({
  experiment: exp,
  productId,
}: {
  experiment: Experiment
  productId: string
}) {
  const [startState, startAction] = useActionState(
    startExperimentAction,
    {} as { error?: string; success?: string },
  )
  const [abandonState, abandonAction] = useActionState(
    abandonExperimentAction,
    {} as { error?: string; success?: string },
  )

  const winner = exp.variants.find((v) => v.id === exp.winnerVariantId)

  return (
    <div className="panel rounded-xl p-5 space-y-4">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between">
        <div>
          <h4 className="font-medium">{exp.name}</h4>
          {exp.hypothesis && (
            <p className="mt-1 text-sm text-ink-soft">{exp.hypothesis}</p>
          )}
        </div>
        <span className={`font-mono text-xs ${STATUS_CLASS[exp.status] ?? 'text-ink-soft'}`}>
          {STATUS_LABEL[exp.status] ?? exp.status}
        </span>
      </div>

      {/* Metadados */}
      <div className="flex flex-wrap gap-3 font-mono text-xs text-ink-faint">
        <span>dimensão: {exp.dimension}</span>
        <span>métrica: {METRIC_LABEL[exp.primaryMetric] ?? exp.primaryMetric}</span>
        <span>amostra mín.: {exp.minSamplePerVariant}/variante</span>
      </div>

      {/* Variantes */}
      {exp.variants.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {exp.variants.map((v) => {
            const isWinner = v.id === exp.winnerVariantId
            return (
              <div
                key={v.id}
                className={`rounded-lg border p-3 ${
                  isWinner ? 'border-ok bg-ok/5' : 'border-line'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm font-medium">{v.label}</span>
                  {isWinner && <span className="text-ok text-xs">vencedor</span>}
                  {v.isControl && !isWinner && (
                    <span className="text-ink-faint text-xs">controle</span>
                  )}
                </div>
                <p className="mt-0.5 text-sm text-ink-soft">{v.name}</p>
                <div className="mt-2 flex gap-3 font-mono text-xs text-ink-faint">
                  <span>{v.clicks} cliques</span>
                  <span>{v.signups} signups</span>
                  <span>{v.paid} pagos</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Conclusão */}
      {exp.conclusion && (
        <p className="rounded-lg bg-surface-dim px-3 py-2 text-sm text-ink-soft">
          {exp.conclusion}
        </p>
      )}

      {/* Ações */}
      {exp.status === 'draft' && (
        <form action={startAction} className="flex items-center gap-3">
          <input type="hidden" name="id" value={exp.id} />
          <input type="hidden" name="productId" value={productId} />
          <button
            type="submit"
            className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90"
          >
            Iniciar experimento
          </button>
          {startState.error && <p className="text-xs text-danger">{startState.error}</p>}
        </form>
      )}

      {exp.status === 'running' && (
        <form action={abandonAction} className="flex items-center gap-3">
          <input type="hidden" name="id" value={exp.id} />
          <input type="hidden" name="productId" value={productId} />
          <button
            type="submit"
            className="rounded-lg border border-danger/30 px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger/5"
          >
            Abandonar
          </button>
          {abandonState.error && <p className="text-xs text-danger">{abandonState.error}</p>}
        </form>
      )}
    </div>
  )
}
