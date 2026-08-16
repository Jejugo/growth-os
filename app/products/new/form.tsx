'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { createProductAction, type ActionState } from '../../actions/products'

export function NewProductForm() {
  const [state, action] = useActionState<ActionState, FormData>(createProductAction, {})

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

      <Submit />
    </form>
  )
}

function Submit() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-ink text-surface hover:bg-ink-soft w-full rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
    >
      {pending ? 'Cadastrando…' : 'Cadastrar e analisar'}
    </button>
  )
}
