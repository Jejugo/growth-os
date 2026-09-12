'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { CaretDown } from '@phosphor-icons/react'
import { createProductAction, type ActionState as ProductActionState } from '../../../actions/products'
import { createIdeaProductAction, type ActionState as IdeaActionState } from '../../../actions/validation'
import { CopyPromptBlock } from '../../../_components/copy-prompt-block'
import { Spinner } from '../../../_components/spinner'
import { IDEA_BRIEF_PROMPT, PROJECT_BRIEF_PROMPT } from './_lib/idea-brief-prompt'

export function NewProductForm() {
  const [mode, setMode] = useState<'url' | 'idea'>('url')

  return (
    <div className="space-y-5">
      <div className="seg">
        <label className="seg-opt">
          <input
            type="radio"
            name="mode"
            checked={mode === 'url'}
            onChange={() => setMode('url')}
          />
          Já tenho um site
        </label>
        <label className="seg-opt">
          <input
            type="radio"
            name="mode"
            checked={mode === 'idea'}
            onChange={() => setMode('idea')}
          />
          É uma ideia (sem site)
        </label>
      </div>
      {mode === 'url' ? <UrlForm /> : <IdeaForm />}
    </div>
  )
}

function UrlForm() {
  const [state, action] = useActionState<ProductActionState, FormData>(createProductAction, {})

  return (
    <form action={action} className="space-y-4">
      <div className="field">
        <label htmlFor="url">URL do produto</label>
        <input
          id="url"
          name="url"
          type="text"
          required
          autoFocus
          placeholder="orbitjobs.com"
          className="input"
          style={{ fontFamily: 'var(--font-mono)' }}
        />
        <p className="text-ink-faint mt-1.5 text-xs">
          A URL é normalizada para https, sem query nem barra final.
        </p>
      </div>

      {state.error && (
        <p className="border-danger/30 bg-danger/5 text-danger rounded-md border px-3 py-2 text-sm">
          {state.error}
        </p>
      )}

      <Submit label="Cadastrar e analisar" pendingLabel="Cadastrando…" />
    </form>
  )
}

/** Brief primeiro, URL depois (roadmap fase 4.5): sem site, o que existe é a hipótese. */
function IdeaForm() {
  const [state, action] = useActionState<IdeaActionState, FormData>(createIdeaProductAction, {})
  const [promptSource, setPromptSource] = useState<'idea' | 'project'>('idea')

  return (
    <div className="space-y-4">
      <details className="card group">
        <summary className="flex cursor-pointer list-none items-center justify-between">
          <span className="text-sm font-medium">Sem os campos na mão ainda? Gere um prompt</span>
          <CaretDown className="text-ink-faint size-4 transition-transform group-open:rotate-180" />
        </summary>
        <div className="mt-3 space-y-3">
          <div className="seg">
            <label className="seg-opt">
              <input
                type="radio"
                name="prompt-source"
                checked={promptSource === 'idea'}
                onChange={() => setPromptSource('idea')}
              />
              Só tenho a ideia
            </label>
            <label className="seg-opt">
              <input
                type="radio"
                name="prompt-source"
                checked={promptSource === 'project'}
                onChange={() => setPromptSource('project')}
              />
              Já tenho um projeto em andamento
            </label>
          </div>
          <p className="text-ink-faint text-xs">
            {promptSource === 'idea'
              ? 'Cole isto numa IA de sua confiança, descreva a ideia em linguagem solta e cole as respostas de volta nos campos abaixo.'
              : 'Cole isto na IA que já acompanha seu projeto (ex.: Claude Code) — ela responde com base no código e no que já foi construído, sem precisar que você descreva nada do zero.'}
          </p>
          <CopyPromptBlock
            key={promptSource}
            prompt={promptSource === 'idea' ? IDEA_BRIEF_PROMPT : PROJECT_BRIEF_PROMPT}
            rows={12}
          />
        </div>
      </details>

      <form action={action} className="space-y-4">
        <TextField id="name" label="Nome da ideia" required autoFocus />
        <TextArea id="problem" label="Problema — que dor, de quem" required />
        <TextArea id="audience" label="Audiência-alvo" required />
        <TextArea id="solutionSketch" label="Esboço de solução" required />
        <TextArea
          id="riskiestAssumption"
          label="Hipótese mais arriscada"
          required
          hint="O que precisa ser verdade para esta ideia existir — vira a hipótese do teste."
        />
        <TextArea id="whyNow" label="Por que agora (opcional)" />
        <TextArea id="alternatives" label="Alternativas hoje (opcional)" hint='Inclui "planilha" e "nada".' />

        {state.error && (
          <p className="border-danger/30 bg-danger/5 text-danger rounded-md border px-3 py-2 text-sm">
            {state.error}
          </p>
        )}

        <Submit label="Cadastrar ideia" pendingLabel="Cadastrando…" />
      </form>
    </div>
  )
}

function TextField({
  id,
  label,
  required,
  autoFocus,
}: {
  id: string
  label: string
  required?: boolean
  autoFocus?: boolean
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} name={id} type="text" required={required} autoFocus={autoFocus} className="input" />
    </div>
  )
}

function TextArea({
  id,
  label,
  required,
  hint,
}: {
  id: string
  label: string
  required?: boolean
  hint?: string
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <textarea id={id} name={id} rows={2} required={required} className="input resize-none" />
      {hint && <p className="text-ink-faint mt-1.5 text-xs">{hint}</p>}
    </div>
  )
}

function Submit({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="btn btn-primary w-full">
      {pending && <Spinner />}
      {pending ? pendingLabel : label}
    </button>
  )
}
