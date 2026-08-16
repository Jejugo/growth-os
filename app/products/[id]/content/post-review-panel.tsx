'use client'

import { useActionState } from 'react'
import type { SocialPost } from '@/modules/content'
import type { RiskReview } from '@/modules/content'
import {
  approvePostAction,
  rejectPostAction,
  editPostBodyAction,
  type ActionState,
} from '../../../actions/content'

export function PostReviewPanel({
  post,
  productId,
}: {
  post: SocialPost
  productId: string
}) {
  const review = post.riskReview as RiskReview | null
  const canApprove = review?.verdict !== 'block'

  return (
    <div className="panel space-y-4 rounded-xl p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-ink-faint">{post.channel}</span>
          <span className="font-mono text-xs text-ink-faint">·</span>
          <span className="font-mono text-xs text-ink-faint">{post.status}</span>
        </div>
        <a
          href="?"
          className="text-ink-faint hover:text-ink font-mono text-xs transition-colors"
        >
          fechar ×
        </a>
      </div>

      {/* Texto do post */}
      <div className="space-y-2">
        <div>
          <p className="label-xs mb-1">Hook</p>
          <p className="text-sm font-medium">{post.hook}</p>
        </div>
        <div>
          <p className="label-xs mb-1">Body</p>
          <p className="text-ink-soft text-sm leading-relaxed whitespace-pre-wrap">{post.body}</p>
        </div>
        {post.cta && (
          <div>
            <p className="label-xs mb-1">CTA ({post.ctaType})</p>
            <p className="text-sm">{post.cta}</p>
          </div>
        )}
      </div>

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
            <p className="text-ink mt-2 rounded bg-surface-dim px-2 py-1 text-xs">
              Sugestão: {review.suggestedFix}
            </p>
          )}
        </div>
      )}

      {/* Ações */}
      {post.status === 'pending_approval' && (
        <div className="flex gap-2">
          <ApproveButton postId={post.id} productId={productId} disabled={!canApprove} />
          <RejectForm postId={post.id} productId={productId} />
        </div>
      )}

      {post.rejectionReason && (
        <div className="border-line rounded-lg border p-3">
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
      {state.error && <p className="text-danger mt-1 text-xs">{state.error}</p>}
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
          className="border-line w-full rounded-lg border bg-transparent px-3 py-2 text-sm placeholder:text-ink-faint focus:outline-none focus:ring-1 focus:ring-accent"
          required
        />
        <button
          type="submit"
          className="border-danger/30 hover:bg-danger/5 rounded-lg border px-4 py-2 text-sm font-medium text-danger transition-colors"
        >
          Rejeitar
        </button>
      </div>
      {state.error && <p className="text-danger text-xs">{state.error}</p>}
      {state.success && <p className="text-ok text-xs">{state.success}</p>}
    </form>
  )
}
