'use client'

import { useActionState, useState, useTransition, useEffect } from 'react'
import type { SocialPost } from '@/modules/content'
import type { RiskReview } from '@/modules/content'
import { CHANNEL_CAPABILITIES } from '@/modules/content/types'
import type { ChannelAccount } from '@/modules/distribution/schema'
import {
  approvePostAction,
  rejectPostAction,
  editPostBodyAction,
  type ActionState,
} from '../../../actions/content'
import { scheduleAndPublish } from '../../../actions/distribution'
import { rewriteValidationPostAction } from '../../../actions/validation'

const GRAPHEME_LIMITS: Record<string, number> = {
  bluesky: 300,
  linkedin: 3000,
  newsletter: 2000,
  reddit: 10000,
  blog: 5000,
}

function countGraphemes(text: string): number {
  try {
    return [...new Intl.Segmenter().segment(text)].length
  } catch {
    return text.length
  }
}

function assembleText(hook: string, body: string, cta: string): string {
  return [hook.trim(), body.trim(), cta.trim()].filter(Boolean).join('\n\n')
}

export function PostReviewPanel({
  post,
  productId,
  productUrl,
  channelAccounts = [],
}: {
  post: SocialPost
  productId: string
  productUrl: string
  channelAccounts?: ChannelAccount[]
}) {
  const review = post.riskReview as RiskReview | null
  const canApprove = review?.verdict !== 'block'
  const limit = GRAPHEME_LIMITS[post.channel] ?? 3000
  const supportsLinks = CHANNEL_CAPABILITIES[post.channel]?.supportsLinks ?? false

  // Estado editável
  const [hook, setHook] = useState(post.hook)
  const [body, setBody] = useState(post.body)
  const [cta, setCta] = useState(post.cta ?? '')
  const [includeLink, setIncludeLink] = useState(post.linkUrl !== null)

  // URL estimada para o contador (NEXT_PUBLIC_BASE_URL + /r/ + 8 chars)
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'
  const estimatedUrl = `${baseUrl}/r/xxxxxxxx`

  const assembled = assembleText(hook, body, cta)
  const textWithLink = includeLink && supportsLinks ? `${assembled}\n\n${estimatedUrl}` : assembled
  const graphemeCount = countGraphemes(textWithLink)
  const isOver = graphemeCount > limit

  // Valor de linkUrl a salvar: URL do produto (se ativando) ou null (se desativando)
  const linkUrlToSave = includeLink && supportsLinks ? (post.linkUrl ?? productUrl) : ''

  const [editState, editAction, editPending] = useActionState(editPostBodyAction, {})
  const [dirty, setDirty] = useState(false)

  // O painel não remonta ao trocar de post nem depois de uma reescrita (mesmo
  // postId, conteúdo novo) — resincroniza os campos quando o post do servidor muda.
  useEffect(() => {
    setHook(post.hook)
    setBody(post.body)
    setCta(post.cta ?? '')
    setIncludeLink(post.linkUrl !== null)
  }, [post.id, post.hook, post.body, post.cta, post.linkUrl])

  // Marca dirty quando qualquer campo muda
  useEffect(() => {
    const changed =
      hook !== post.hook ||
      body !== post.body ||
      cta !== (post.cta ?? '') ||
      includeLink !== (post.linkUrl !== null)
    setDirty(changed)
  }, [hook, body, cta, includeLink, post.hook, post.body, post.cta, post.linkUrl])

  return (
    <div className="panel space-y-4 rounded-xl p-5">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-ink-faint">{post.channel}</span>
          <span className="font-mono text-xs text-ink-faint">·</span>
          <span className="font-mono text-xs text-ink-faint">{post.status}</span>
        </div>
        <a
          href="?"
          className="font-mono text-xs text-ink-faint transition-colors hover:text-ink"
        >
          fechar ×
        </a>
      </div>

      {/* Editor inline */}
      <form action={editAction} className="space-y-3">
        <input type="hidden" name="productId" value={productId} />
        <input type="hidden" name="postId" value={post.id} />
        <input type="hidden" name="linkUrl" value={linkUrlToSave} />

        <div>
          <label className="label-xs mb-1 block">Hook</label>
          <textarea
            name="hook"
            value={hook}
            onChange={(e) => setHook(e.target.value)}
            rows={2}
            className="w-full resize-none rounded-lg border border-line bg-transparent px-3 py-2 text-sm font-medium text-ink placeholder:text-ink-faint focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>

        <div>
          <label className="label-xs mb-1 block">Body</label>
          <textarea
            name="body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            className="w-full resize-none rounded-lg border border-line bg-transparent px-3 py-2 text-sm leading-relaxed text-ink-soft placeholder:text-ink-faint focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>

        <div>
          <label className="label-xs mb-1 block">CTA {post.ctaType && <span className="text-ink-faint">({post.ctaType})</span>}</label>
          <textarea
            name="cta"
            value={cta}
            onChange={(e) => setCta(e.target.value)}
            rows={1}
            className="w-full resize-none rounded-lg border border-line bg-transparent px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>

        {/* Toggle de link */}
        {supportsLinks && (
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={includeLink}
              onChange={(e) => setIncludeLink(e.target.checked)}
              className="accent-accent"
            />
            <span className="text-sm text-ink-soft">Incluir link de rastreamento</span>
            {includeLink && (
              <span className="font-mono text-xs text-ink-faint">
                (~{countGraphemes(`\n\n${estimatedUrl}`)} grafemas)
              </span>
            )}
          </label>
        )}

        {/* Contador de grafemas */}
        <div className="flex items-center justify-between">
          <span className={`font-mono text-xs ${isOver ? 'text-danger font-semibold' : 'text-ink-faint'}`}>
            {graphemeCount} / {limit} grafemas
            {isOver && ' — excede o limite!'}
          </span>
          {dirty && (
            <button
              type="submit"
              disabled={editPending || isOver}
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-50"
            >
              {editPending ? 'Salvando…' : 'Salvar'}
            </button>
          )}
        </div>

        {editState.error && <p className="text-xs text-danger">{editState.error}</p>}
        {editState.success && <p className="text-xs text-ok">{editState.success}</p>}
      </form>

      {/* Risk review */}
      {review && (
        <div
          className={[
            'rounded-lg border p-3',
            review.verdict === 'pass'
              ? 'border-ok/30 bg-ok/5'
              : review.verdict === 'flag'
                ? 'border-warn/30 bg-warn/5'
                : 'border-danger/30 bg-danger/5',
          ].join(' ')}
        >
          <p
            className={[
              'text-sm font-medium',
              review.verdict === 'pass'
                ? 'text-ok'
                : review.verdict === 'flag'
                  ? 'text-warn'
                  : 'text-danger',
            ].join(' ')}
          >
            Risk Review: {review.verdict}
            {review.verdict === 'block' && ' — edite antes de aprovar'}
          </p>
          {review.reasons.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs text-ink-soft">
              {review.reasons.map((r, i) => (
                <li key={i} className="flex gap-1">
                  <span>•</span>
                  {r}
                </li>
              ))}
            </ul>
          )}
          {review.suggestedFix && (
            <p className="mt-2 rounded bg-surface-dim px-2 py-1 text-xs text-ink">
              Sugestão: {review.suggestedFix}
            </p>
          )}
          {review.verdict === 'flag' && post.variantOf && (
            <RewriteButton postId={post.id} productId={productId} />
          )}
        </div>
      )}

      {/* Ações de aprovação */}
      {post.status === 'pending_approval' && (
        <div className="flex gap-2">
          <ApproveButton postId={post.id} productId={productId} disabled={!canApprove} />
          <RejectForm postId={post.id} productId={productId} />
        </div>
      )}

      {post.status === 'approved' && (
        <PublishNowButton
          postId={post.id}
          productId={productId}
          channelAccounts={channelAccounts}
        />
      )}

      {post.rejectionReason && (
        <div className="rounded-lg border border-line p-3">
          <p className="label-xs mb-1">Motivo de rejeição</p>
          <p className="text-sm text-ink-soft">{post.rejectionReason}</p>
        </div>
      )}
    </div>
  )
}

function ApproveButton({
  postId,
  productId,
  disabled,
}: {
  postId: string
  productId: string
  disabled: boolean
}) {
  const [state, formAction] = useActionState(approvePostAction, {})

  return (
    <form action={formAction} className="flex-1">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="postId" value={postId} />
      <button
        type="submit"
        disabled={disabled}
        className="w-full rounded-lg bg-ok px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-ok/90 disabled:cursor-not-allowed disabled:opacity-40"
        title={disabled ? 'Post com risco "block" não pode ser aprovado sem edição' : undefined}
      >
        {state.success ? state.success : 'Aprovar'}
      </button>
      {state.error && <p className="mt-1 text-xs text-danger">{state.error}</p>}
    </form>
  )
}

function PublishNowButton({
  postId,
  productId,
  channelAccounts,
}: {
  postId: string
  productId: string
  channelAccounts: ChannelAccount[]
}) {
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<{ publicationId: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedAccountId, setSelectedAccountId] = useState(channelAccounts[0]?.id ?? '')

  if (channelAccounts.length === 0) {
    return (
      <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink-soft">
        Nenhuma conta ativa para este canal.{' '}
        <a href={`/products/${productId}/channels`} className="text-accent hover:underline">
          Conectar conta →
        </a>
      </div>
    )
  }

  if (result) {
    return (
      <div className="rounded-lg border border-ok/30 bg-ok/5 px-3 py-2 text-sm text-ok">
        Publicação enfileirada.{' '}
        <a href={`/products/${productId}/publications`} className="underline">
          Ver histórico →
        </a>
      </div>
    )
  }

  function handlePublish() {
    setError(null)
    startTransition(async () => {
      try {
        const res = await scheduleAndPublish(productId, postId, selectedAccountId)
        setResult(res)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao enfileirar publicação.')
      }
    })
  }

  return (
    <div className="space-y-2">
      {channelAccounts.length > 1 && (
        <select
          value={selectedAccountId}
          onChange={(e) => setSelectedAccountId(e.target.value)}
          className="w-full rounded border border-line bg-canvas px-2 py-1.5 text-sm text-ink outline-none"
        >
          {channelAccounts.map((a) => (
            <option key={a.id} value={a.id}>
              @{a.handle}{a.displayName ? ` — ${a.displayName}` : ''}
            </option>
          ))}
        </select>
      )}
      <button
        onClick={handlePublish}
        disabled={pending || !selectedAccountId}
        className="w-full rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
      >
        {pending ? 'Enfileirando…' : '🚀 Publicar agora'}
      </button>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}

function RewriteButton({ postId, productId }: { postId: string; productId: string }) {
  const [state, formAction, pending] = useActionState(rewriteValidationPostAction, {})

  return (
    <form action={formAction} className="mt-3">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="postId" value={postId} />
      <button
        type="submit"
        disabled={pending}
        className="flex items-center gap-2 rounded-md border border-warn/40 px-3 py-1.5 text-xs font-medium text-warn transition-colors hover:bg-warn/10 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending && (
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-warn border-t-transparent" />
        )}
        {pending ? 'Reformulando…' : '✨ Reformular com base no review'}
      </button>
      {state.error && <p className="mt-1 text-xs text-danger">{state.error}</p>}
      {state.success && <p className="mt-1 text-xs text-ok">{state.success}</p>}
    </form>
  )
}

function RejectForm({ postId, productId }: { postId: string; productId: string }) {
  const [state, formAction] = useActionState(rejectPostAction, {})

  return (
    <form action={formAction} className="flex flex-1 flex-col gap-2">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="postId" value={postId} />
      <div className="flex gap-2">
        <input
          type="text"
          name="reason"
          placeholder="Motivo da rejeição (obrigatório)"
          className="w-full rounded-lg border border-line bg-transparent px-3 py-2 text-sm placeholder:text-ink-faint focus:outline-none focus:ring-1 focus:ring-accent"
          required
        />
        <button
          type="submit"
          className="rounded-lg border border-danger/30 px-4 py-2 text-sm font-medium text-danger transition-colors hover:bg-danger/5"
        >
          Rejeitar
        </button>
      </div>
      {state.error && <p className="text-xs text-danger">{state.error}</p>}
      {state.success && <p className="text-xs text-ok">{state.success}</p>}
    </form>
  )
}
