'use client'

import { useActionState, useRef } from 'react'
import { generateLandingPageAction } from '../../../../actions/validation'
import { Spinner } from '../../../../_components/spinner'
import { shortDeployUrl } from '../_lib/deploy-url'
import type { LandingPage } from '@/modules/validation'

export function GenerateLandingPageBlock({
  productId,
  landingPage,
}: {
  productId: string
  landingPage: LandingPage | null
}) {
  const [state, action, pending] = useActionState(generateLandingPageAction, {})
  const [adjustState, adjustAction, adjustPending] = useActionState(generateLandingPageAction, {})
  const adjustFormRef = useRef<HTMLFormElement>(null)

  const isGenerating = pending || adjustPending || landingPage?.status === 'generating'
  const copy = landingPage?.copy
  const review = landingPage?.riskReview

  return (
    <div className="border-line space-y-3 rounded-md border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Landing page automática</p>
        <form action={action}>
          <input type="hidden" name="productId" value={productId} />
          <button type="submit" disabled={isGenerating} className="btn btn-primary">
            {pending && <Spinner size="xs" />}
            {pending
              ? 'Gerando…'
              : landingPage
                ? '✨ Gerar novamente do zero'
                : '✨ Gerar landing automaticamente'}
          </button>
        </form>
      </div>

      {state.error && <p className="text-danger text-xs">{state.error}</p>}

      {landingPage?.status === 'generating' && (
        <div className="border-accent/30 bg-accent-soft flex items-center gap-3 rounded-md border p-3 text-sm">
          <Spinner size="md" className="text-accent shrink-0" />
          Escrevendo a copy, revisando risco e publicando — pode levar até 1 minuto.
        </div>
      )}

      {landingPage?.status === 'blocked' && (
        <div className="border-danger/30 bg-danger-soft space-y-1 rounded-md border p-3">
          <p className="text-danger text-sm font-medium">Bloqueada pela revisão de risco — gere de novo:</p>
          {review?.reasons.map((r, i) => (
            <p key={i} className="text-danger text-xs">
              • {r}
            </p>
          ))}
        </div>
      )}

      {landingPage?.status === 'failed' && (
        <div className="border-danger/30 bg-danger-soft rounded-md border p-3 text-sm">
          <p className="text-danger font-medium">Falha ao gerar a landing</p>
          <p className="text-ink-soft mt-1">{landingPage.error ?? 'Erro desconhecido.'}</p>
        </div>
      )}

      {landingPage?.status === 'ready' && copy && (
        <div className="border-ok/35 bg-ok-soft space-y-2 rounded-md border p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-ok text-sm font-medium">✓ Landing publicada com sucesso</span>
            {shortDeployUrl(landingPage) && (
              <a
                href={shortDeployUrl(landingPage)!}
                target="_blank"
                rel="noreferrer"
                className="text-accent shrink-0 text-xs underline"
              >
                Abrir ↗
              </a>
            )}
          </div>
          {review && (
            <span className={`font-mono text-xs ${review.verdict === 'flag' ? 'text-warn' : 'text-ok'}`}>
              risk review: {review.verdict}
            </span>
          )}
          <p className="text-sm font-medium">{copy.headline}</p>
          <p className="text-ink-soft text-xs">{copy.subheadline}</p>
        </div>
      )}

      {landingPage && landingPage.status !== 'generating' && (
        <form
          ref={adjustFormRef}
          action={adjustAction}
          onSubmit={() => setTimeout(() => adjustFormRef.current?.reset(), 0)}
          className="border-line space-y-2 border-t pt-3"
        >
          <input type="hidden" name="productId" value={productId} />
          <label htmlFor="adjustmentNote" className="text-xs font-medium">
            Não ficou do jeito certo? Descreva o que ajustar
          </label>
          <textarea
            id="adjustmentNote"
            name="adjustmentNote"
            rows={2}
            required
            disabled={isGenerating}
            placeholder='Ex.: "o headline tá genérico, foca na dor de perder tempo com planilha" ou "tira o terceiro benefício, não faz sentido"'
            className="input resize-none text-sm"
          />
          <button type="submit" disabled={isGenerating} className="btn btn-secondary">
            {adjustPending && <Spinner size="xs" />}
            {adjustPending ? 'Revisando…' : 'Pedir ajustes'}
          </button>
          {adjustState.error && <p className="text-danger text-xs">{adjustState.error}</p>}
          <p className="text-ink-faint text-xs">
            A IA revisa a copy atual considerando seu pedido — preserva o resto, não recomeça do zero.
          </p>
        </form>
      )}
    </div>
  )
}
