'use client'

import { useState } from 'react'
import { useFormStatus } from 'react-dom'
import { editFieldAction, unlockFieldAction } from '../../actions/products'
import { Spinner } from '../../_components/spinner'

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

  const meta = editing
    ? 'em edição'
    : locked
      ? 'travado por você'
      : confidence !== undefined
        ? `confiança ${confidence.toFixed(2)}`
        : 'IA'
  const metaClass = editing || locked
    ? 'text-accent'
    : confidence !== undefined && confidence < 0.5
      ? 'text-warn'
      : 'text-ink-faint'

  return (
    <div
      className={`border-line grid grid-cols-[170px_minmax(0,1fr)_auto] items-start gap-3.5 border-b px-4 py-3 last:border-b-0 ${editing ? 'bg-accent-soft/30' : ''}`}
    >
      <div>
        <div className={`text-[12.5px] ${editing ? 'text-accent' : ''}`}>{label}</div>
        <div className={`mt-1 font-mono text-[10px] ${metaClass}`}>{meta}</div>
      </div>

      {editing ? (
        <form action={editFieldAction} onSubmit={() => setEditing(false)} className="space-y-2">
          <input type="hidden" name="productId" value={productId} />
          <input type="hidden" name="field" value={field} />
          <textarea
            name="value"
            defaultValue={asText}
            rows={isList ? Math.max(3, (value as string[]).length + 1) : 3}
            className="input"
          />
          {isList && <p className="text-ink-faint text-xs">Um item por linha.</p>}
          <div className="flex gap-2">
            <SaveButton />
            <button type="button" onClick={() => setEditing(false)} className="btn btn-ghost">
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <FieldValue value={value} />
      )}

      <div className="flex flex-col items-end gap-1.5">
        {locked && (
          <form action={unlockFieldAction}>
            <input type="hidden" name="productId" value={productId} />
            <input type="hidden" name="field" value={field} />
            <UnlockButton />
          </form>
        )}
        {!editing && (
          <button type="button" onClick={() => setEditing(true)} className="btn btn-ghost">
            Editar
          </button>
        )}
      </div>
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
          <li key={`${item}-${i}`} className="tag tag-neutral">
            {item}
          </li>
        ))}
      </ul>
    )
  }

  return <p className="text-sm leading-relaxed whitespace-pre-wrap">{value}</p>
}

function UnlockButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="btn btn-ghost"
      title="A próxima análise volta a preencher este campo"
    >
      {pending && <Spinner size="xs" />}
      {pending ? 'Destravando…' : 'Destravar'}
    </button>
  )
}

function SaveButton() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="btn btn-primary">
      {pending && <Spinner />}
      {pending ? 'Salvando…' : 'Salvar e travar'}
    </button>
  )
}
