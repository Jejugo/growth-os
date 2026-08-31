'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { createProductAction, type ActionState as ProductActionState } from '../../actions/products'
import { createIdeaProductAction, type ActionState as IdeaActionState } from '../../actions/validation'

export function NewProductForm() {
  const [mode, setMode] = useState<'url' | 'idea'>('url')

  return (
    <div className="space-y-4">
      <div className="border-line flex gap-1 border-b">
        <TabButton active={mode === 'url'} onClick={() => setMode('url')}>
          Já tenho um site
        </TabButton>
        <TabButton active={mode === 'idea'} onClick={() => setMode('idea')}>
          É uma ideia (sem site)
        </TabButton>
      </div>
      {mode === 'url' ? <UrlForm /> : <IdeaForm />}
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'rounded-t-md px-3 py-2 text-sm font-medium transition-colors',
        active ? 'border-line border border-b-transparent text-ink' : 'text-ink-soft hover:text-ink',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

function UrlForm() {
  const [state, action] = useActionState<ProductActionState, FormData>(createProductAction, {})

  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="url" className="label-xs">
          URL do produto
        </label>
        <input
          id="url"
          name="url"
          type="text"
          required
          autoFocus
          placeholder="orbitjobs.com"
          className="border-line bg-panel focus:border-accent mt-1.5 w-full rounded-lg border px-3 py-2.5 font-mono text-sm outline-none transition-colors"
        />
        <p className="text-ink-faint mt-1.5 text-xs">
          A URL é normalizada para https, sem query nem barra final.
        </p>
      </div>

      {state.error && (
        <p className="border-danger/30 bg-danger/5 text-danger rounded-lg border px-3 py-2 text-sm">
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

  return (
    <form action={action} className="space-y-4">
      <TextField id="name" label="Nome da ideia" required autoFocus />
      <TextArea id="problem" label="Problema — que dor, de quem" required />
      <TextArea id="audience" label="Audiência-alvo" required />
      <TextArea id="solutionSketch" label="Esboço de solução" required />
      <TextArea id="riskiestAssumption" label="Hipótese mais arriscada" required
        hint="O que precisa ser verdade para esta ideia existir — vira a hipótese do teste." />
      <TextArea id="whyNow" label="Por que agora (opcional)" />
      <TextArea id="alternatives" label="Alternativas hoje (opcional)" hint='Inclui "planilha" e "nada".' />

      {state.error && (
        <p className="border-danger/30 bg-danger/5 text-danger rounded-lg border px-3 py-2 text-sm">
          {state.error}
        </p>
      )}

      <Submit label="Cadastrar ideia" pendingLabel="Cadastrando…" />
    </form>
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
    <div>
      <label htmlFor={id} className="label-xs">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type="text"
        required={required}
        autoFocus={autoFocus}
        className="border-line bg-panel focus:border-accent mt-1.5 w-full rounded-lg border px-3 py-2.5 text-sm outline-none transition-colors"
      />
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
    <div>
      <label htmlFor={id} className="label-xs">
        {label}
      </label>
      <textarea
        id={id}
        name={id}
        rows={2}
        required={required}
        className="border-line bg-panel focus:border-accent mt-1.5 w-full resize-none rounded-lg border px-3 py-2.5 text-sm outline-none transition-colors"
      />
      {hint && <p className="text-ink-faint mt-1.5 text-xs">{hint}</p>}
    </div>
  )
}

function Submit({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-ink text-surface hover:bg-ink-soft w-full rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
    >
      {pending ? pendingLabel : label}
    </button>
  )
}
