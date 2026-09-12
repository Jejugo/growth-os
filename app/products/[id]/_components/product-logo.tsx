'use client'

import { useActionState, useRef, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { uploadProductLogoAction, removeProductLogoAction } from '../../../actions/products'
import { Spinner } from '../../../_components/spinner'
import { ProductAvatar } from '../../_components/product-avatar'

const MAX_LOGO_DIMENSION = 256

/**
 * Um logo não precisa dos megapixels originais de uma foto — redimensiona no navegador antes de
 * enviar, então a maioria dos arquivos nunca chega perto do limite de tamanho do servidor. SVG fica
 * intocado (é vetor, redimensionar não reduz o arquivo).
 */
async function resizeForLogo(file: File): Promise<File> {
  if (file.type === 'image/svg+xml') return file

  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_LOGO_DIMENSION / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return file
  ctx.drawImage(bitmap, 0, 0, width, height)

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) return file

  return new File([blob], file.name.replace(/\.[^.]+$/, '.png'), { type: 'image/png' })
}

/** Avatar do produto + upload — mostrado no topo do perfil e usado na lista de produtos. */
export function ProductLogo({
  productId,
  productName,
  logoUrl,
}: {
  productId: string
  productName: string
  logoUrl: string | null
}) {
  const [state, action, pending] = useActionState(uploadProductLogoAction, {})
  const [resizing, setResizing] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const busy = pending || resizing

  async function handleFileChange() {
    const file = inputRef.current?.files?.[0]
    if (!file || !inputRef.current) return

    setResizing(true)
    const resized = await resizeForLogo(file)
    setResizing(false)

    const transfer = new DataTransfer()
    transfer.items.add(resized)
    inputRef.current.files = transfer.files
    formRef.current?.requestSubmit()
  }

  return (
    <div className="flex shrink-0 flex-col items-center gap-1.5">
      <ProductAvatar name={productName} logoUrl={logoUrl} size={48} />

      <div className="flex items-center gap-2">
        <form
          ref={formRef}
          action={action}
          onSubmit={() => setTimeout(() => formRef.current?.reset(), 0)}
        >
          <input type="hidden" name="productId" value={productId} />
          <input
            ref={inputRef}
            type="file"
            name="file"
            accept="image/png,image/jpeg,image/svg+xml,image/webp"
            className="hidden"
            onChange={handleFileChange}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="text-accent inline-flex items-center gap-1 text-[10.5px] underline disabled:opacity-50"
          >
            {busy && <Spinner size="xs" />}
            {resizing ? 'Preparando…' : pending ? 'Enviando…' : logoUrl ? 'Trocar' : 'Adicionar logo'}
          </button>
        </form>

        {logoUrl && (
          <form action={removeProductLogoAction}>
            <input type="hidden" name="productId" value={productId} />
            <RemoveLogoButton />
          </form>
        )}
      </div>

      {state.error && <p className="text-danger w-20 text-center text-[10px]">{state.error}</p>}
    </div>
  )
}

function RemoveLogoButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="text-ink-faint text-[10.5px] underline disabled:opacity-50"
    >
      {pending ? 'Removendo…' : 'Remover'}
    </button>
  )
}
