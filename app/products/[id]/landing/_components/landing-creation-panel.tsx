'use client'

import { useState } from 'react'
import type { LandingPage, LandingPageDraft } from '@/modules/validation'
import { GenerateLandingPageBlock } from './generate-landing-block'
import { CopyPromptBlock } from '../../../../_components/copy-prompt-block'
import { CustomLandingDraftPanel } from './custom-landing-draft-panel'

export function LandingCreationPanel({
  productId,
  landingPage,
  draft,
  draftAlreadyPublished,
  designPrompt,
  trackingSnippet,
}: {
  productId: string
  landingPage: LandingPage | null
  draft: LandingPageDraft | null
  draftAlreadyPublished: boolean
  designPrompt: string
  trackingSnippet: string
}) {
  const [mode, setMode] = useState<'auto' | 'external'>(
    landingPage?.source === 'custom_upload' || draft ? 'external' : 'auto',
  )

  // Cada bloco só enxerga a landing atual quando ela veio do mesmo caminho — evita, por exemplo,
  // o bloco de upload mostrar "pronta" com dado de uma geração automática (sem deployUrl seu).
  const autoLandingPage = landingPage?.source === 'ai_generated' ? landingPage : null
  const customLandingPage = landingPage?.source === 'custom_upload' ? landingPage : null

  return (
    <div className="space-y-4">
      <div className="seg w-full sm:w-auto">
        <label className="seg-opt flex-1 sm:flex-none">
          <input
            type="radio"
            name="landing-mode"
            checked={mode === 'auto'}
            onChange={() => setMode('auto')}
          />
          Gerar automaticamente
        </label>
        <label className="seg-opt flex-1 sm:flex-none">
          <input
            type="radio"
            name="landing-mode"
            checked={mode === 'external'}
            onChange={() => setMode('external')}
          />
          Design externo
        </label>
      </div>

      {mode === 'auto' ? (
        <GenerateLandingPageBlock productId={productId} landingPage={autoLandingPage} />
      ) : (
        <div className="space-y-4">
          <CopyPromptBlock prompt={designPrompt} />
          <CustomLandingDraftPanel
            productId={productId}
            landingPage={customLandingPage}
            draft={draft}
            draftAlreadyPublished={draftAlreadyPublished}
            trackingSnippet={trackingSnippet}
          />
        </div>
      )}
    </div>
  )
}
