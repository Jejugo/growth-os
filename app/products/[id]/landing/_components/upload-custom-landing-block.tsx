'use client'

import { useActionState, useRef } from 'react'
import { uploadCustomLandingDraftAction } from '../../../../actions/validation'
import type { LandingPage } from '@/modules/validation'

export function UploadCustomLandingBlock({
  productId,
  landingPage,
}: {
  productId: string
  landingPage: LandingPage | null
}) {
  const [state, action, pending] = useActionState(uploadCustomLandingDraftAction, {})
  const formRef = useRef<HTMLFormElement>(null)
  const isGenerating = pending || landingPage?.status === 'generating'

  return (
    <div className="border-line space-y-3 rounded-md border p-3">
      <p className="text-sm font-medium">Upload de landing customizada</p>

      <form
        ref={formRef}
        action={action}
        onSubmit={() => setTimeout(() => formRef.current?.reset(), 0)}
        className="flex items-center gap-2"
      >
        <input type="hidden" name="productId" value={productId} />
        <input
          type="file"
          name="file"
          accept=".zip"
          required
          disabled={isGenerating}
          className="input flex-1"
        />
        <button type="submit" disabled={isGenerating} className="btn btn-primary shrink-0">
          {isGenerating ? 'Enviando…' : 'Enviar zip'}
        </button>
      </form>

      <p className="text-ink-faint text-xs">
        Um arquivo .zip com <span className="font-mono">index.html</span> na raiz (ou dentro de uma
        única pasta). Só HTML/CSS/JS nesta versão — sem imagens ou fontes.
      </p>

      {state.error && <p className="text-danger text-xs">{state.error}</p>}

      {landingPage?.status === 'generating' && (
        <p className="text-ink-faint text-xs">Publicando na Vercel — pode levar alguns segundos.</p>
      )}

      {landingPage?.status === 'failed' && (
        <p className="text-danger text-xs">{landingPage.error ?? 'Falha ao publicar a landing.'}</p>
      )}

      {landingPage?.status === 'ready' && landingPage.deployUrl && (
        <a
          href={landingPage.deployUrl}
          target="_blank"
          rel="noreferrer"
          className="text-accent text-xs underline"
        >
          Abrir landing enviada ↗
        </a>
      )}
    </div>
  )
}
