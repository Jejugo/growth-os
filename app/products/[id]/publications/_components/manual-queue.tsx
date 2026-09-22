'use client'

import Link from 'next/link'
import { useActionState, useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  confirmManualPublication,
  discardManualPublication,
} from '../../../../actions/distribution'
import type { ManualQueueItem } from '@/modules/distribution/manual'
import { Spinner } from '../../../../_components/spinner'

type ManualActionState = { error?: string; success?: string }

export function ManualQueue({
  productId,
  items,
  hasManualChannel,
}: {
  productId: string
  items: ManualQueueItem[]
  hasManualChannel: boolean
}) {
  return (
    <section id="manual-queue" aria-labelledby="manual-queue-title" className="space-y-3 scroll-mt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 id="manual-queue-title" className="text-accent text-sm font-medium">
            Para publicar{items.length > 0 ? ` (${items.length})` : ''}
          </h2>
          <p className="text-ink-soft mt-1 text-xs">
            O GrowthOS preparou o texto. Falta você publicar no canal e confirmar aqui.
          </p>
        </div>
        {items.length > 0 && (
          <span className="tag border border-warn/35 text-warn font-mono">esperando você</span>
        )}
      </div>

      {items.length === 0 ? (
        <div className="border-line text-ink-soft rounded-md border border-dashed p-5 text-sm">
          <p>Nada esperando você.</p>
          {!hasManualChannel && (
            <Link href={`/products/${productId}/channels`} className="text-accent mt-1 inline-block hover:underline">
              Cadastre o LinkedIn manual em Canais →
            </Link>
          )}
        </div>
      ) : (
        <div className="grid gap-3">
          {items.map((item) => <ManualQueueCard key={item.publicationId} item={item} />)}
        </div>
      )}
    </section>
  )
}

function ManualQueueCard({ item }: { item: ManualQueueItem }) {
  const router = useRouter()
  const [externalUrl, setExternalUrl] = useState('')
  const [copied, setCopied] = useState(false)
  const [showDiscard, setShowDiscard] = useState(false)
  const refreshedSuccess = useRef<string | null>(null)

  const confirmAction = useCallback(
    async (_prev: ManualActionState, _formData: FormData): Promise<ManualActionState> => {
      void _prev
      void _formData
      try {
        const result = await confirmManualPublication(item.publicationId, externalUrl.trim() || undefined)
        if ('error' in result) return { error: result.error }
        return { success: 'Publicação confirmada.' }
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Não foi possível confirmar a publicação.' }
      }
    },
    [externalUrl, item.publicationId],
  )
  const discardAction = useCallback(
    async (_prev: ManualActionState, _formData: FormData): Promise<ManualActionState> => {
      void _prev
      void _formData
      try {
        const result = await discardManualPublication(item.publicationId)
        if ('error' in result) return { error: result.error }
        return { success: 'Item descartado.' }
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Não foi possível descartar o item.' }
      }
    },
    [item.publicationId],
  )
  const [confirmState, confirmFormAction, confirmPending] = useActionState<ManualActionState, FormData>(
    confirmAction,
    {},
  )
  const [discardState, discardFormAction, discardPending] = useActionState<ManualActionState, FormData>(
    discardAction,
    {},
  )

  useEffect(() => {
    const success = confirmState.success ?? discardState.success
    if (success && refreshedSuccess.current !== success) {
      refreshedSuccess.current = success
      router.refresh()
    }
  }, [confirmState.success, discardState.success, router])

  async function copyText() {
    try {
      await navigator.clipboard.writeText(item.text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  const hasTrackedLink = item.text.includes('/r/')
  const expiresLabel = formatExpiry(item.expiresAt)
  const ageLabel = formatAge(item.createdAt)

  return (
    <article className="surface-elevated space-y-3 rounded-lg p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="tag tag-neutral font-mono">LinkedIn</span>
        <span className="truncate text-sm font-medium">{item.pageName}</span>
        <span className="text-ink-faint ml-auto font-mono text-xs">{ageLabel}</span>
        <span className="text-warn font-mono text-xs">{expiresLabel}</span>
      </div>

      <pre className="border-line bg-base text-ink-soft max-h-64 overflow-auto whitespace-pre-wrap rounded-md border p-3 font-sans text-sm leading-relaxed">
        {item.text}
      </pre>

      {!hasTrackedLink && (
        <p className="border-warn/35 bg-warn-soft text-warn rounded-md border px-3 py-2 text-xs" role="alert">
          Link sem rastreio — cliques não serão atribuídos.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={copyText} className="btn btn-secondary">
          {copied ? 'Copiado' : 'Copiar'}
        </button>
        <a href={item.openUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
          Abrir LinkedIn ↗
        </a>
      </div>

      <div className="border-line space-y-3 border-t pt-3">
        <form action={confirmFormAction} className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="field min-w-0 flex-1">
            <label htmlFor={`external-url-${item.publicationId}`}>URL do post (opcional)</label>
            <input
              id={`external-url-${item.publicationId}`}
              name="externalUrl"
              type="url"
              value={externalUrl}
              onChange={(event) => setExternalUrl(event.target.value)}
              placeholder="https://www.linkedin.com/posts/..."
              className="input"
            />
          </div>
          <button type="submit" disabled={confirmPending} className="btn btn-primary">
            {confirmPending && <Spinner size="xs" />}
            {confirmPending ? 'Salvando…' : 'Publiquei'}
          </button>
        </form>
        {confirmState.error && <p className="text-danger text-xs" role="alert">{confirmState.error}</p>}

        {showDiscard ? (
          <div className="border-danger/30 bg-danger-soft flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-danger text-xs">Descartar é definitivo: este post não voltará para a fila.</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowDiscard(false)} className="btn btn-ghost">
                Voltar
              </button>
              <form action={discardFormAction}>
                <button type="submit" disabled={discardPending} className="btn btn-ghost text-danger">
                  {discardPending && <Spinner size="xs" />}
                  {discardPending ? 'Descartando…' : 'Sim, descartar'}
                </button>
              </form>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setShowDiscard(true)} className="btn btn-ghost text-danger">
            Descartar
          </button>
        )}
        {discardState.error && <p className="text-danger text-xs" role="alert">{discardState.error}</p>}
      </div>
    </article>
  )
}

function formatExpiry(value: Date | string): string {
  const diff = new Date(value).getTime() - Date.now()
  if (diff <= 0) return 'expirado'
  const days = Math.floor(diff / 86_400_000)
  const hours = Math.floor((diff % 86_400_000) / 3_600_000)
  return days > 0 ? `expira em ${days}d${hours > 0 ? ` ${hours}h` : ''}` : `expira em ${Math.max(hours, 1)}h`
}

function formatAge(value: Date | string): string {
  const diff = Math.max(0, Date.now() - new Date(value).getTime())
  const hours = Math.floor(diff / 3_600_000)
  if (hours < 1) return 'agora'
  if (hours < 24) return `há ${hours}h`
  return `há ${Math.floor(hours / 24)}d`
}
