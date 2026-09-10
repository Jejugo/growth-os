'use client'

import { useActionState } from 'react'
import { generateLandingPageAction } from '../../../../actions/validation'
import type { LandingPage } from '@/modules/validation'

export function GenerateLandingPageBlock({
  productId,
  landingPage,
}: {
  productId: string
  landingPage: LandingPage | null
}) {
  const [state, action, pending] = useActionState(generateLandingPageAction, {})
  const isGenerating = pending || landingPage?.status === 'generating'
  const copy = landingPage?.copy
  const review = landingPage?.riskReview

  return (
    <div className="border-line space-y-3 rounded-md border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Landing page automática</p>
        <form action={action}>
          <input type="hidden" name="productId" value={productId} />
          <button type="submit" disabled={isGenerating} className="btn btn-primary">
            {isGenerating && (
              <span className="border-accent h-3 w-3 animate-spin rounded-full border-2 border-t-transparent" />
            )}
            {isGenerating
              ? 'Gerando…'
              : landingPage
                ? '✨ Gerar novamente'
                : '✨ Gerar landing automaticamente'}
          </button>
        </form>
      </div>

      {state.error && <p className="text-danger text-xs">{state.error}</p>}

      {landingPage?.status === 'generating' && (
        <p className="text-ink-faint text-xs">
          Escrevendo a copy, revisando risco e publicando — pode levar até 1 minuto.
        </p>
      )}

      {landingPage?.status === 'blocked' && (
        <div className="space-y-1">
          <p className="text-danger text-xs font-medium">
            Bloqueada pela revisão de risco — gere de novo:
          </p>
          {review?.reasons.map((r, i) => (
            <p key={i} className="text-danger text-xs">
              • {r}
            </p>
          ))}
        </div>
      )}

      {landingPage?.status === 'failed' && (
        <p className="text-danger text-xs">{landingPage.error ?? 'Falha ao gerar a landing.'}</p>
      )}

      {landingPage?.status === 'ready' && copy && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            {review && (
              <span
                className={`font-mono text-xs ${review.verdict === 'flag' ? 'text-warn' : 'text-ok'}`}
              >
                risk review: {review.verdict}
              </span>
            )}
            {landingPage.deployUrl && (
              <a
                href={landingPage.deployUrl}
                target="_blank"
                rel="noreferrer"
                className="text-accent text-xs underline"
              >
                Abrir landing gerada ↗
              </a>
            )}
          </div>
          <p className="text-sm font-medium">{copy.headline}</p>
          <p className="text-ink-soft text-xs">{copy.subheadline}</p>
        </div>
      )}
    </div>
  )
}
