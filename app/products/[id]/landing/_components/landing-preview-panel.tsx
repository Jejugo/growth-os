import { Spinner } from '../../../../_components/spinner'
import { shortDeployUrl } from '../_lib/deploy-url'
import type { LandingPage, LandingPageDraft } from '@/modules/validation'

const STATUS_META: Record<LandingPage['status'], { label: string; className: string }> = {
  generating: { label: 'gerando…', className: 'tag-accent' },
  ready: { label: 'publicada', className: 'text-ok border border-ok/35' },
  blocked: { label: 'bloqueada', className: 'text-danger border border-danger/35' },
  failed: { label: 'falhou', className: 'text-danger border border-danger/35' },
}

/** Coluna da direita da página de Landing — status, URL e um preview ao vivo do que está no ar. */
export function LandingPreviewPanel({
  productId,
  landingPage,
  draft,
  lastLiveDeployUrl,
}: {
  productId: string
  landingPage: LandingPage | null
  /** Rascunho em edição (upload customizado) — tem prioridade: é o que você está iterando agora. */
  draft: LandingPageDraft | null
  /**
   * URL da última publicação que deu certo, quando ela é DIFERENTE da tentativa mais recente —
   * ou seja, a mais recente falhou/foi bloqueada, mas o site ainda está no ar com a versão anterior.
   * `null` quando a mais recente É a última publicada com sucesso (nada "escondido" pra mostrar).
   */
  lastLiveDeployUrl: string | null
}) {
  const publicUrl = landingPage ? shortDeployUrl(landingPage) : null

  if (draft) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="tag tag-accent font-mono">rascunho</span>
          <span className="text-ink-faint font-mono text-[10.5px]">ainda não publicado</span>
        </div>

        <div className="border-line overflow-hidden rounded-md border">
          {/* `v=` força o iframe a recarregar a cada ajuste — sem isso o `src` fica igual entre
              renders e o navegador não sabe que o conteúdo do rascunho mudou. */}
          <iframe
            src={`/api/landing-drafts/${productId}?v=${new Date(draft.updatedAt).getTime()}`}
            title="Preview do rascunho"
            className="h-[60vh] min-h-[420px] w-full sm:h-[70vh] lg:h-[85vh] lg:min-h-[600px]"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          />
        </div>

        {landingPage?.status === 'ready' && publicUrl && (
          <p className="text-ink-faint text-xs">
            A versão publicada continua no ar em{' '}
            <a href={publicUrl} target="_blank" rel="noreferrer" className="text-accent underline">
              {publicUrl.replace(/^https?:\/\//, '')} ↗
            </a>{' '}
            — só reflete este rascunho depois que você clicar em &ldquo;Publicar&rdquo;.
          </p>
        )}
      </div>
    )
  }

  if (!landingPage) {
    return (
      <div className="border-line text-ink-soft flex min-h-[320px] flex-col items-center justify-center rounded-md border border-dashed p-6 text-center text-sm">
        Nenhuma landing gerada ainda.
      </div>
    )
  }

  const meta = STATUS_META[landingPage.status]

  return (
    <div className="border-line space-y-3 rounded-md border p-3">
      <div className="flex items-center justify-between gap-2">
        <span className={`tag font-mono ${meta.className}`}>
          {landingPage.status === 'generating' && (
            <span className="bg-current mr-1.5 size-1.5 animate-pulse rounded-full" aria-hidden />
          )}
          {meta.label}
        </span>
        <span className="text-ink-faint font-mono text-[10.5px]">
          {landingPage.source === 'custom_upload' ? 'upload' : 'gerada por IA'}
        </span>
      </div>

      {publicUrl && (
        <a
          href={publicUrl}
          target="_blank"
          rel="noreferrer"
          className="text-accent block truncate text-xs underline"
        >
          {publicUrl.replace(/^https?:\/\//, '')} ↗
        </a>
      )}

      {landingPage.status === 'generating' && (
        <div className="border-accent/30 bg-accent-soft flex items-center gap-3 rounded-md border p-3 text-sm">
          <Spinner size="md" className="text-accent shrink-0" />
          Publicando — o preview aparece assim que ficar pronto.
        </div>
      )}

      {(landingPage.status === 'failed' || landingPage.status === 'blocked') && (
        <div className="border-danger/30 bg-danger-soft rounded-md border p-3 text-sm">
          <p className="text-danger font-medium">
            {landingPage.status === 'blocked' ? 'Bloqueada pela revisão de risco' : 'Falha ao publicar'}
          </p>
          <p className="text-ink-soft mt-1">{landingPage.error ?? 'Erro desconhecido.'}</p>
          {lastLiveDeployUrl && (
            <p className="mt-2">
              A última versão publicada com sucesso continua no ar:{' '}
              <a href={lastLiveDeployUrl} target="_blank" rel="noreferrer" className="text-accent underline">
                abrir ↗
              </a>
            </p>
          )}
        </div>
      )}

      {landingPage.status === 'ready' && publicUrl && (
        <div className="border-line overflow-hidden rounded-md border">
          <iframe
            src={publicUrl}
            title="Preview da landing page"
            className="h-[60vh] min-h-[420px] w-full sm:h-[70vh] lg:h-[85vh] lg:min-h-[600px]"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          />
        </div>
      )}
    </div>
  )
}
