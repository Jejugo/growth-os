'use client'

import { useFormStatus } from 'react-dom'
import { Spinner } from '../../../_components/spinner'

export function MarkLaunchedButton() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="btn btn-primary">
      {pending && <Spinner size="xs" />}
      {pending ? 'Marcando…' : 'Marcar como lançado'}
    </button>
  )
}
