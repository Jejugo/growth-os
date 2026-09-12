'use client'

import { useActionState } from 'react'
import { dismissLearningAction } from '../../../../actions/analytics'
import { Spinner } from '../../../../_components/spinner'

export function DismissLearningButton({ id, productId }: { id: string; productId: string }) {
  const [, action, pending] = useActionState(
    dismissLearningAction,
    {} as { error?: string; success?: string },
  )

  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="productId" value={productId} />
      <button type="submit" disabled={pending} className="btn btn-ghost shrink-0">
        {pending && <Spinner size="xs" />}
        {pending ? 'Descartando…' : 'Descartar'}
      </button>
    </form>
  )
}
