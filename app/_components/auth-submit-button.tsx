'use client'

import { useFormStatus } from 'react-dom'
import { Spinner } from './spinner'

export function AuthSubmitButton({
  label,
  pendingLabel,
  className,
}: {
  label: string
  pendingLabel: string
  className: string
}) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending && <Spinner size="xs" />}
      {pending ? pendingLabel : label}
    </button>
  )
}
