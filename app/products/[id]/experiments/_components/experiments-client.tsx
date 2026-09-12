'use client'

import { useActionState, useState } from 'react'
import {
  createExperimentAction,
  startExperimentAction,
  abandonExperimentAction,
} from '../../../../actions/analytics'
import { Spinner } from '../../../../_components/spinner'
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

const STATUS_TAG_CLASS: Record<string, string> = {
  draft: 'tag-neutral',
  running: 'tag-accent',
  concluded: 'text-ok border border-ok/35',
  abandoned: 'text-danger border border-danger/35',
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
        <h2 className="text-lg font-medium">Experimentos A/B</h2>
        <button onClick={() => setShowForm((v) => !v)} className="btn btn-primary">
          {showForm ? 'Cancelar' : 'Novo experimento'}
        </button>
      </div>

      {/* Formulário de criação */}
      {showForm && (
        <form action={createAction} className="card space-y-4" style={{ padding: '1.25rem' }}>
          <h3 className="card-title">Novo experimento</h3>

          <input type="hidden" name="productId" value={productId} />

          <div className="field">
            <label>Nome *</label>
            <input name="name" required className="input" placeholder="Ex: Ângulo problem vs. solution" />
          </div>

          <div className="field">
            <label>Hipótese</label>
            <textarea
              name="hypothesis"
              rows={2}
              className="input resize-none"
              placeholder="Ex: Posts com ângulo 'problem' convertem mais que 'solution'"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="field">
              <label>Dimensão</label>
              <select name="dimension" className="input">
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

            <div className="field">
              <label>Métrica primária</label>
              <select name="primaryMetric" className="input">
                <option value="signup">Signups</option>
                <option value="paid">Pagos</option>
                <option value="activation">Ativações</option>
                <option value="qualified_visit">Visitas qualificadas</option>
              </select>
            </div>
          </div>

          <div className="field">
            <label>Amostra mínima por variante</label>
            <input name="minSamplePerVariant" type="number" min={10} defaultValue={100} className="input" />
          </div>

          {createState.error && <p className="text-danger text-xs">{createState.error}</p>}

          <button type="submit" disabled={createPending} className="btn btn-primary">
            {createPending && <Spinner size="xs" />}
            {createPending ? 'Criando…' : 'Criar experimento'}
          </button>
        </form>
      )}

      {/* Em andamento */}
      {active.length > 0 && (
        <section>
          <h3 className="text-ink-soft mb-3 text-sm font-medium">Em andamento</h3>
          <div className="grid gap-3">
            {active.map((exp) => (
              <ExperimentCard key={exp.id} experiment={exp} productId={productId} />
            ))}
          </div>
        </section>
      )}

      {/* Rascunhos */}
      {drafts.length > 0 && (
        <section>
          <h3 className="text-ink-soft mb-3 text-sm font-medium">Rascunhos</h3>
          <div className="grid gap-3">
            {drafts.map((exp) => (
              <ExperimentCard key={exp.id} experiment={exp} productId={productId} />
            ))}
          </div>
        </section>
      )}

      {/* Histórico */}
      {concluded.length > 0 && (
        <section>
          <h3 className="text-ink-soft mb-3 text-sm font-medium">Histórico</h3>
          <div className="grid gap-3 opacity-70">
            {concluded.map((exp) => (
              <ExperimentCard key={exp.id} experiment={exp} productId={productId} />
            ))}
          </div>
        </section>
      )}

      {experiments.length === 0 && !showForm && (
        <div className="border-line text-ink-soft rounded-md border border-dashed p-8 text-center text-sm">
          Nenhum experimento ainda. Crie seu primeiro experimento A/B para comparar variantes de
          conteúdo.
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
  const [startState, startAction, startPending] = useActionState(
    startExperimentAction,
    {} as { error?: string; success?: string },
  )
  const [abandonState, abandonAction, abandonPending] = useActionState(
    abandonExperimentAction,
    {} as { error?: string; success?: string },
  )

  const maxSignups = Math.max(1, ...exp.variants.map((v) => v.signups))

  return (
    <div className="border-line space-y-4 rounded-md border p-4">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h4 className="font-medium">{exp.name}</h4>
            <span className={`tag font-mono ${STATUS_TAG_CLASS[exp.status] ?? 'tag-neutral'}`}>
              {STATUS_LABEL[exp.status] ?? exp.status}
            </span>
          </div>
          {exp.hypothesis && <p className="text-ink-soft mt-1 text-sm">{exp.hypothesis}</p>}
        </div>
        {exp.status === 'draft' && (
          <form action={startAction} className="shrink-0">
            <input type="hidden" name="id" value={exp.id} />
            <input type="hidden" name="productId" value={productId} />
            <button type="submit" disabled={startPending} className="btn btn-primary">
              {startPending && <Spinner size="xs" />}
              {startPending ? 'Iniciando…' : 'Iniciar experimento'}
            </button>
          </form>
        )}
        {exp.status === 'running' && (
          <form action={abandonAction} className="shrink-0">
            <input type="hidden" name="id" value={exp.id} />
            <input type="hidden" name="productId" value={productId} />
            <button
              type="submit"
              disabled={abandonPending}
              className="btn btn-secondary"
              style={{ color: 'var(--color-danger)', borderColor: 'color-mix(in srgb, var(--color-danger) 40%, transparent)' }}
            >
              {abandonPending && <Spinner size="xs" className="text-danger" />}
              {abandonPending ? 'Abandonando…' : 'Abandonar'}
            </button>
          </form>
        )}
      </div>

      {/* Metadados */}
      <div className="text-ink-faint flex flex-wrap gap-5 font-mono text-xs">
        <span>dimensão: {exp.dimension}</span>
        <span>métrica: {METRIC_LABEL[exp.primaryMetric] ?? exp.primaryMetric}</span>
        <span>amostra mín.: {exp.minSamplePerVariant}/variante</span>
      </div>

      {startState.error && <p className="text-danger text-xs">{startState.error}</p>}
      {abandonState.error && <p className="text-danger text-xs">{abandonState.error}</p>}

      {/* Variantes */}
      {exp.variants.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {exp.variants.map((v) => {
            const isWinner = v.id === exp.winnerVariantId
            const signupRate = v.clicks > 0 ? (v.signups / v.clicks) * 100 : 0
            const barWidth = Math.max(4, Math.round((v.signups / maxSignups) * 100))
            return (
              <div
                key={v.id}
                className={`grid gap-2 rounded-md border p-3.5 ${isWinner ? 'border-ok/35' : 'border-line'}`}
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-medium">{v.label}</span>
                  <span className="flex-1 truncate text-sm">{v.name}</span>
                  {isWinner && <span className="text-ok font-mono text-xs">vencedor</span>}
                  {v.isControl && !isWinner && (
                    <span className="text-ink-faint font-mono text-xs">controle</span>
                  )}
                </div>
                <div className="text-ink-faint flex gap-4 font-mono text-xs">
                  <span>{v.clicks} cliques</span>
                  <span>{v.signups} signups</span>
                  <span>{v.paid} pagos</span>
                </div>
                <div className="bg-line/40 h-[5px] overflow-hidden rounded-full">
                  <div
                    className={`h-full rounded-full ${isWinner ? 'bg-ok' : 'bg-line'}`}
                    style={{ width: `${barWidth}%` }}
                  />
                </div>
                <div className="text-ink-faint flex justify-between font-mono text-[10.5px]">
                  <span>{signupRate.toFixed(2)}% signup/clique</span>
                  <span>
                    {v.clicks}/{exp.minSamplePerVariant} amostra
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Conclusão */}
      {exp.conclusion && (
        <p className="border-line rounded-md border px-3 py-2 text-sm">{exp.conclusion}</p>
      )}
    </div>
  )
}
