'use client'

import { useActionState, useState, useTransition } from 'react'
import type { SocialPost } from '@/modules/content'
import type { RiskReview } from '@/modules/content'
import { CHANNEL_CAPABILITIES } from '@/modules/content/types'
import type { ChannelAccount } from '@/modules/distribution'
import {
  approvePostAction,
  rejectPostAction,
  editPostBodyAction,
  type ActionState,
} from '../../../actions/content'
import { scheduleAndPublish } from '../../../actions/distribution'
import { rewriteValidationPostAction } from '../../../actions/validation'
import { Spinner } from '../../../_components/spinner'

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
  const textWithLink = includeLink && supportsLinks ? `${assembled}\n${estimatedUrl}` : assembled
  const graphemeCount = countGraphemes(textWithLink)
  const isOver = graphemeCount > limit

  // Valor de linkUrl a salvar: URL do produto (se ativando) ou null (se desativando)
  const linkUrlToSave = includeLink && supportsLinks ? (post.linkUrl ?? productUrl) : ''

  const [editState, editAction, editPending] = useActionState(editPostBodyAction, {})
  const [approvalPending, startApprovalTransition] = useTransition()
  const [approvalResult, setApprovalResult] = useState<ActionState>({})
  const dirty =
    hook !== post.hook ||
    body !== post.body ||
    cta !== (post.cta ?? '') ||
    includeLink !== (post.linkUrl !== null)

  function handleSaveAndApprove() {
    setApprovalResult({})
    startApprovalTransition(async () => {
      const formData = new FormData()
      formData.set('productId', productId)
      formData.set('postId', post.id)
      formData.set('hook', hook)
      formData.set('body', body)
      formData.set('cta', cta)
      formData.set('linkUrl', linkUrlToSave)

      const editResult = await editPostBodyAction({}, formData)
      if (editResult.error) {
        setApprovalResult(editResult)
        return
      }

      const approveResult = await approvePostAction({}, formData)
      setApprovalResult(approveResult)
    })
  }

  return (
    <div className="panel space-y-4 p-4">
      {/* Cabeçalho */}
      <div className="flex min-h-11 items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="tag tag-outline font-mono">{post.channel}</span>
          <span className="text-ink-faint font-mono text-xs">{post.status}</span>
        </div>
        <a href="?" className="text-ink-faint hover:text-ink inline-flex min-h-11 items-center px-2 text-xs transition-colors">
          fechar ×
        </a>
      </div>

      {/* Editor inline */}
      <form action={editAction} className="space-y-3">
        <input type="hidden" name="productId" value={productId} />
        <input type="hidden" name="postId" value={post.id} />
        <input type="hidden" name="linkUrl" value={linkUrlToSave} />

        <div className="field">
          <label>Hook</label>
          <textarea
            name="hook"
            value={hook}
            onChange={(e) => setHook(e.target.value)}
            rows={2}
            className="input resize-none"
            style={{ fontWeight: 500 }}
          />
        </div>

        <div className="field">
          <label>Body</label>
          <textarea
            name="body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            className="input text-ink-soft resize-none"
            style={{ lineHeight: 1.6 }}
          />
        </div>

        <div className="field">
          <label>
            CTA {post.ctaType && <span className="text-ink-faint">({post.ctaType})</span>}
          </label>
          <textarea
            name="cta"
            value={cta}
            onChange={(e) => setCta(e.target.value)}
            rows={1}
            className="input resize-none"
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
            <span className="text-ink-soft text-sm">Incluir link de rastreamento</span>
            {includeLink && (
              <span className="text-ink-faint font-mono text-xs">
                (~{countGraphemes(`\n${estimatedUrl}`)} grafemas)
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
            <button type="submit" disabled={editPending || isOver} className="btn btn-primary">
              {editPending && <Spinner size="xs" />}
              {editPending ? 'Salvando…' : 'Salvar'}
            </button>
          )}
        </div>

        {editState.error && <p className="text-danger text-xs">{editState.error}</p>}
        {editState.success && <p className="text-ok text-xs">{editState.success}</p>}
      </form>

      {/* Risk review */}
      {review && (
        <div
          className={[
            'rounded-md border p-3',
            review.verdict === 'pass'
              ? 'border-ok/30 bg-ok-soft'
              : review.verdict === 'flag'
                ? 'border-warn/30 bg-warn-soft'
                : 'border-danger/30 bg-danger-soft',
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
            <ul className="text-ink-soft mt-2 space-y-1 text-xs">
              {review.reasons.map((r, i) => (
                <li key={i} className="flex gap-1">
                  <span>•</span>
                  {r}
                </li>
              ))}
            </ul>
          )}
          {review.suggestedFix && (
            <p className="border-line bg-surface text-ink mt-2 rounded-sm border px-2 py-1 text-xs">
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
        <div className="space-y-2">
          {dirty && !canApprove && (
            <p className="border-warn/30 bg-warn-soft text-warn rounded-md border px-3 py-2 text-xs">
              Salve a edição primeiro. O bloqueio de risco não é recalculado automaticamente; este
              post continuará sem aprovação até uma nova revisão.
            </p>
          )}
          {dirty && canApprove && (
            <p className="text-ink-soft text-xs">
              A aprovação salvará suas alterações antes de mudar o status do post.
            </p>
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            {dirty && canApprove ? (
              <button
                type="button"
                onClick={handleSaveAndApprove}
                disabled={approvalPending || editPending || isOver}
                className="btn btn-primary flex-1"
              >
                {approvalPending && <Spinner size="xs" />}
                {approvalPending ? 'Salvando e aprovando…' : 'Salvar e aprovar'}
              </button>
            ) : (
              <ApproveButton postId={post.id} productId={productId} disabled={!canApprove || editPending} />
            )}
            <RejectForm postId={post.id} productId={productId} />
          </div>
          {approvalResult.error && <p aria-live="polite" className="text-danger text-xs">{approvalResult.error}</p>}
          {approvalResult.success && <p aria-live="polite" className="text-ok text-xs">{approvalResult.success}</p>}
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
        <div className="border-line rounded-md border p-3">
          <p className="label-xs mb-1">Motivo de rejeição</p>
          <p className="text-ink-soft text-sm">{post.rejectionReason}</p>
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
  const [state, formAction, pending] = useActionState(approvePostAction, {})

  return (
    <form action={formAction} className="flex-1">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="postId" value={postId} />
      <button
        type="submit"
        disabled={disabled || pending}
        className="btn btn-primary w-full disabled:cursor-not-allowed"
        title={disabled ? 'Post com risco "block" não pode ser aprovado sem edição' : undefined}
      >
        {pending && <Spinner size="xs" />}
        {pending ? 'Aprovando…' : state.success ? state.success : 'Aprovar'}
      </button>
      {state.error && <p className="text-danger mt-1 text-xs">{state.error}</p>}
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
      <div className="border-line text-ink-soft rounded-md border px-3 py-2 text-xs">
        Nenhuma conta ativa para este canal.{' '}
        <a href={`/products/${productId}/channels`} className="text-accent hover:underline">
          Conectar conta →
        </a>
      </div>
    )
  }

  if (result) {
    return (
      <div className="border-ok/30 bg-ok-soft text-ok rounded-md border px-3 py-2 text-sm">
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
          className="input"
        >
          {channelAccounts.map((a) => (
            <option key={a.id} value={a.id}>
              @{a.handle}
              {a.displayName ? ` — ${a.displayName}` : ''}
            </option>
          ))}
        </select>
      )}
      <button type="button" onClick={handlePublish} disabled={pending || !selectedAccountId} className="btn btn-primary w-full">
        {pending && <Spinner />}
        {pending ? 'Enfileirando…' : 'Publicar agora'}
      </button>
      {error && <p className="text-danger text-xs">{error}</p>}
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
        className="flex min-h-11 items-center gap-2 rounded-md border border-warn/40 px-3 py-2 text-xs font-medium text-warn transition-colors hover:bg-warn/10 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending && <Spinner size="xs" className="text-warn" />}
        {pending ? 'Reformulando…' : '✨ Reformular com base no review'}
      </button>
      {state.error && <p className="mt-1 text-xs text-danger">{state.error}</p>}
      {state.success && <p className="mt-1 text-xs text-ok">{state.success}</p>}
    </form>
  )
}

function RejectForm({ postId, productId }: { postId: string; productId: string }) {
  const [state, formAction, pending] = useActionState(rejectPostAction, {})

  return (
    <form action={formAction} className="flex flex-1 flex-col gap-2">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="postId" value={postId} />
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          name="reason"
          placeholder="Motivo da rejeição (obrigatório)"
          className="input"
          required
        />
        <button
          type="submit"
          disabled={pending}
          className="btn btn-secondary"
          style={{ color: 'var(--color-danger)', borderColor: 'color-mix(in srgb, var(--color-danger) 40%, transparent)' }}
        >
          {pending && <Spinner size="xs" className="text-danger" />}
          {pending ? 'Rejeitando…' : 'Rejeitar'}
        </button>
      </div>
      {state.error && <p className="text-danger text-xs">{state.error}</p>}
      {state.success && <p className="text-ok text-xs">{state.success}</p>}
    </form>
  )
}
