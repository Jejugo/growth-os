'use client'

import { useFormStatus } from 'react-dom'
import { Spinner } from '../../../../_components/spinner'

export function DeriveSegmentsButton({ hasSegments }: { hasSegments: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="btn btn-secondary">
      {pending && <Spinner size="xs" />}
      {pending ? 'Derivando…' : hasSegments ? 'Rederivar segmentos' : 'Derivar segmentos'}
    </button>
  )
}
