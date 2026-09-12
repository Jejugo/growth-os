'use client'

import { useRef } from 'react'
import { useFormStatus } from 'react-dom'
import { deleteProductAction } from '../../../actions/products'
import { Spinner } from '../../../_components/spinner'

export function DeleteProductButton({
  productId,
  productName,
}: {
  productId: string
  productName: string
}) {
  const formRef = useRef<HTMLFormElement>(null)

  function handleClick() {
    if (confirm(`Deletar "${productName}" e todos os dados associados? Essa ação não pode ser desfeita.`)) {
      formRef.current?.requestSubmit()
    }
  }

  return (
    <form ref={formRef} action={deleteProductAction}>
      <input type="hidden" name="productId" value={productId} />
      <DeleteButtonInner onClick={handleClick} />
    </form>
  )
}

function DeleteButtonInner({ onClick }: { onClick: () => void }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="btn btn-secondary"
      style={{ color: 'var(--color-danger)', borderColor: 'color-mix(in srgb, var(--color-danger) 40%, transparent)' }}
    >
      {pending && <Spinner size="xs" className="text-danger" />}
      {pending ? 'Excluindo…' : 'Excluir'}
    </button>
  )
}
