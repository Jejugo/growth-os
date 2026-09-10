'use client'

import { useActionState } from 'react'
import { dismissLearningAction } from '../../../../actions/analytics'

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
        Descartar
      </button>
    </form>
  )
}
