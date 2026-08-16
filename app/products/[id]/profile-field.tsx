'use client'

import { useState } from 'react'
import { useFormStatus } from 'react-dom'
import { editFieldAction, unlockFieldAction } from '../../actions/products'

interface Props {
  productId: string
  field: string
  label: string
  value: string | string[] | null
  locked: boolean
  confidence?: number
}

export function ProfileField({ productId, field, label, value, locked, confidence }: Props) {
  const [editing, setEditing] = useState(false)
  const isList = Array.isArray(value)
  const asText = isList ? value.join('\n') : (value ?? '')

  return (
    <div className="border-line border-b py-4 last:border-b-0">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="label-xs">{label}</span>

        {locked ? (
          <span className="text-warn border-warn/30 bg-warn-soft rounded-full border px-1.5 py-px font-mono text-[10px]">
            editado
          </span>
        ) : (
          <span className="text-ink-faint border-line rounded-full border px-1.5 py-px font-mono text-[10px]">
            IA
          </span>
        )}

        {confidence !== undefined && (
          <span
            className={`font-mono text-[10px] ${confidence < 0.4 ? 'text-warn' : 'text-ink-faint'}`}
            title="Confiança declarada pelo modelo"
          >
            {Math.round(confidence * 100)}%
          </span>
        )}

        <div className="ml-auto flex items-center gap-3">
          {locked && (
            <form action={unlockFieldAction}>
              <input type="hidden" name="productId" value={productId} />
              <input type="hidden" name="field" value={field} />
              <button
                type="submit"
                className="text-ink-faint hover:text-ink text-xs transition-colors"
                title="A próxima análise volta a preencher este campo"
              >
                destravar
              </button>
            </form>
          )}
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="text-ink-faint hover:text-ink text-xs transition-colors"
          >
            {editing ? 'cancelar' : 'editar'}
          </button>
        </div>
      </div>

      {editing ? (
        <form action={editFieldAction} onSubmit={() => setEditing(false)} className="space-y-2">
          <input type="hidden" name="productId" value={productId} />
          <input type="hidden" name="field" value={field} />
          <textarea
            name="value"
            defaultValue={asText}
            rows={isList ? Math.max(3, (value as string[]).length + 1) : 3}
            className="border-line bg-panel focus:border-accent w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors"
          />
          {isList && <p className="text-ink-faint text-xs">Um item por linha.</p>}
          <SaveButton />
        </form>
      ) : (
        <FieldValue value={value} />
      )}
    </div>
  )
}

function FieldValue({ value }: { value: string | string[] | null }) {
  if (value === null || value === undefined || (Array.isArray(value) && value.length === 0)) {
    return <p className="text-ink-faint text-sm italic">não informado</p>
  }

  if (Array.isArray(value)) {
    return (
      <ul className="flex flex-wrap gap-1.5">
        {value.map((item, i) => (
          <li
            key={`${item}-${i}`}
            className="border-line bg-surface rounded-md border px-2 py-1 text-xs"
          >
            {item}
          </li>
        ))}
      </ul>
    )
  }

  return <p className="text-sm leading-relaxed whitespace-pre-wrap">{value}</p>
}

function SaveButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-ink text-surface hover:bg-ink-soft rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
    >
      {pending ? 'Salvando…' : 'Salvar e travar campo'}
    </button>
  )
}
