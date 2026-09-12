'use client'

import { useActionState, useRef } from 'react'
import { CaretDown } from '@phosphor-icons/react'
import {
  uploadCustomLandingDraftAction,
  reviseLandingDraftAction,
  publishLandingDraftAction,
} from '../../../../actions/validation'
import { Spinner } from '../../../../_components/spinner'
import { shortDeployUrl } from '../_lib/deploy-url'
import type { LandingPage, LandingPageDraft } from '@/modules/validation'

export function CustomLandingDraftPanel({
  productId,
  landingPage,
  draft,
  draftAlreadyPublished,
}: {
  productId: string
  landingPage: LandingPage | null
  draft: LandingPageDraft | null
  /** O rascunho atual é byte-a-byte igual ao que já está publicado — nada pendente pra publicar. */
  draftAlreadyPublished: boolean
}) {
  const [uploadState, uploadAction, uploadPending] = useActionState(uploadCustomLandingDraftAction, {})
  const [reviseState, reviseAction, revisePending] = useActionState(reviseLandingDraftAction, {})
  const [publishState, publishAction, publishPending] = useActionState(publishLandingDraftAction, {})

  const uploadFormRef = useRef<HTMLFormElement>(null)
  const reviseFormRef = useRef<HTMLFormElement>(null)

  const isPublishing = publishPending || landingPage?.status === 'generating'
  const busy = uploadPending || revisePending || isPublishing

  return (
    <div className="border-line space-y-3 rounded-md border p-3">
      <p className="text-sm font-medium">Upload de landing customizada</p>

      <form
        ref={uploadFormRef}
        action={uploadAction}
        onSubmit={() => setTimeout(() => uploadFormRef.current?.reset(), 0)}
        className="flex items-center gap-2"
      >
        <input type="hidden" name="productId" value={productId} />
        <input type="file" name="file" accept=".zip" required disabled={busy} className="input flex-1" />
        <button type="submit" disabled={busy} className="btn btn-primary shrink-0">
          {uploadPending && <Spinner size="xs" />}
          {uploadPending ? 'Enviando…' : draft ? 'Substituir zip' : 'Enviar zip'}
        </button>
      </form>

      <p className="text-ink-faint text-xs">
        Um arquivo .zip com <span className="font-mono">index.html</span> na raiz (ou dentro de uma
        única pasta). Só HTML/CSS/JS nesta versão — sem imagens ou fontes.
      </p>

      {uploadState.error && <p className="text-danger text-xs">{uploadState.error}</p>}

      {draft && (
        <div className="border-line space-y-3 border-t pt-3">
          {draft.history.length > 0 && (
            <details className="group">
              <summary className="text-ink-faint flex cursor-pointer list-none items-center gap-1.5 text-xs marker:content-none [&::-webkit-details-marker]:hidden">
                <CaretDown size={11} className="flex-none transition-transform group-open:rotate-180" />
                {draft.history.length} ajuste{draft.history.length === 1 ? '' : 's'} pedido
                {draft.history.length === 1 ? '' : 's'} nesta sessão
              </summary>
              <ol className="text-ink-soft mt-2 list-decimal space-y-1 pl-4 text-xs">
                {draft.history.map((h, i) => (
                  <li key={i}>{h.note}</li>
                ))}
              </ol>
            </details>
          )}

          <form
            ref={reviseFormRef}
            action={reviseAction}
            onSubmit={() => setTimeout(() => reviseFormRef.current?.reset(), 0)}
            className="space-y-2"
          >
            <input type="hidden" name="productId" value={productId} />
            <label htmlFor="reviseNote" className="text-xs font-medium">
              Pedir ajuste no rascunho — o preview atualiza na hora, sem publicar nada
            </label>
            <textarea
              id="reviseNote"
              name="note"
              rows={2}
              required
              disabled={busy}
              placeholder='Ex.: "não gostei, deixa o botão maior e centralizado"'
              className="input resize-none text-sm"
            />
            <button type="submit" disabled={busy} className="btn btn-secondary">
              {revisePending && <Spinner size="xs" />}
              {revisePending ? 'Ajustando…' : 'Pedir ajustes'}
            </button>
            {reviseState.error && <p className="text-danger text-xs">{reviseState.error}</p>}
          </form>

          <form action={publishAction}>
            <input type="hidden" name="productId" value={productId} />
            <button type="submit" disabled={busy} className="btn btn-primary w-full">
              {isPublishing && <Spinner size="xs" />}
              {isPublishing ? 'Publicando…' : draftAlreadyPublished ? 'Publicar de novo' : '🚀 Publicar'}
            </button>
            {publishState.error && <p className="text-danger mt-1 text-xs">{publishState.error}</p>}
            {draftAlreadyPublished && !isPublishing && (
              <p className="text-ink-faint mt-1 text-xs">
                Este rascunho já está publicado — sem mudanças pendentes.
              </p>
            )}
          </form>
        </div>
      )}

      {landingPage?.status === 'failed' && (
        <div className="border-danger/30 bg-danger-soft rounded-md border p-3 text-sm">
          <p className="text-danger font-medium">Falha ao publicar</p>
          <p className="text-ink-soft mt-1">{landingPage.error ?? 'Erro desconhecido.'}</p>
        </div>
      )}

      {landingPage?.status === 'ready' && shortDeployUrl(landingPage) && (
        <div className="border-ok/35 bg-ok-soft flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
          <span className="text-ok font-medium">✓ Publicada com sucesso</span>
          <a
            href={shortDeployUrl(landingPage)!}
            target="_blank"
            rel="noreferrer"
            className="text-accent shrink-0 underline"
          >
            Abrir ↗
          </a>
        </div>
      )}
    </div>
  )
}
