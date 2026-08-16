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
        className="text-danger hover:bg-danger/10 rounded-lg px-3 py-1.5 text-sm transition-colors"
      >
        Deletar produto
      </button>
    </form>
  )
}
