'use client'

import { useFormStatus } from 'react-dom'
import { reanalyzeAction } from '../../../actions/products'
import { Spinner } from '../../../_components/spinner'

export function ReanalyzeButton({ productId, running }: { productId: string; running: boolean }) {
  return (
    <form action={reanalyzeAction}>
      <input type="hidden" name="productId" value={productId} />
      <Inner running={running} />
    </form>
  )
}

function Inner({ running }: { running: boolean }) {
  const { pending } = useFormStatus()
  const busy = pending || running
  return (
    <button type="submit" disabled={busy} className="btn btn-secondary">
      {busy && <Spinner size="xs" />}
      {pending ? 'Disparando…' : 'Reanalisar'}
    </button>
  )
}
