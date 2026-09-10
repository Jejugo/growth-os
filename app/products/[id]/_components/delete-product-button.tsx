'use client'

import { useRef } from 'react'
import { deleteProductAction } from '../../../actions/products'

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
      <button
        type="button"
        onClick={handleClick}
        className="btn btn-secondary"
        style={{ color: 'var(--color-danger)', borderColor: 'color-mix(in srgb, var(--color-danger) 40%, transparent)' }}
      >
        Excluir
      </button>
    </form>
  )
}
