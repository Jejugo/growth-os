'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { planWeekAction } from '../../../../actions/content'
import { Spinner } from '../../../../_components/spinner'

export function PlanWeekButton({ productId }: { productId: string }) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleClick() {
    const formData = new FormData()
    formData.set('productId', productId)
    startTransition(async () => {
      await planWeekAction(formData)
      router.refresh()
    })
  }

  return (
    <button onClick={handleClick} disabled={isPending} className="btn btn-primary">
      {isPending && <Spinner />}
      {isPending ? 'Planejando a semana…' : 'Planejar semana'}
    </button>
  )
}
