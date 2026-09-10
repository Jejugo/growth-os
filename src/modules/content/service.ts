import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { recordDecision } from '@/lib/observability/service'
import { socialPosts } from './schema'
import * as repo from './repo'
import { insertFingerprints, insertFeedback } from './repo'
import { prepareFingerprint } from './dedupe'
import type { SocialPost, ContentIdea, Experiment, ExperimentVariant } from './schema'
import type { RiskReview } from './types'

// --- Aprovação / rejeição de posts --------------------------------------

export class InvalidTransitionError extends Error {
  constructor(from: string, to: string) {
    super(`Transição inválida de status: ${from} → ${to}`)
    this.name = 'InvalidTransitionError'
  }
}

const VALID_TRANSITIONS: Record<SocialPost['status'], SocialPost['status'][]> = {
  draft: ['pending_approval', 'cancelled'],
  pending_approval: ['approved', 'rejected', 'cancelled'],
  approved: ['scheduled', 'cancelled'],
  rejected: [],
  scheduled: ['published', 'cancelled'],
  published: [],
  cancelled: [],
}

function assertValidTransition(from: SocialPost['status'], to: SocialPost['status']): void {
  if (!VALID_TRANSITIONS[from]?.includes(to)) {
    throw new InvalidTransitionError(from, to)
  }
}

export async function approvePost(input: {
  postId: string
  productId: string
}): Promise<void> {
  const post = await repo.findPost(input.postId)
  if (!post) throw new Error(`Post ${input.postId} não encontrado.`)
  if (post.productId !== input.productId) throw new Error('Post não pertence a este produto.')

  // Post com block no risk review não pode ser aprovado
  const review = post.riskReview as RiskReview | null
  if (review?.verdict === 'block') {
    throw new Error('Post com risco "block" não pode ser aprovado sem edição.')
  }

  assertValidTransition(post.status, 'approved')
  await repo.setPostStatus(post.id, 'approved')
  await insertFeedback({
    productId: input.productId,
    postId: post.id,
    action: 'approved',
  })
}

export async function rejectPost(input: {
  postId: string
  productId: string
  reason: string
}): Promise<void> {
  if (!input.reason.trim()) {
    throw new Error('Motivo de rejeição é obrigatório — é o dado mais valioso desta fase.')
  }

  const post = await repo.findPost(input.postId)
  if (!post) throw new Error(`Post ${input.postId} não encontrado.`)
  if (post.productId !== input.productId) throw new Error('Post não pertence a este produto.')

  assertValidTransition(post.status, 'rejected')
  await repo.setPostStatus(post.id, 'rejected', input.reason)
  await insertFeedback({
    productId: input.productId,
    postId: post.id,
    action: 'rejected',
    reason: input.reason,
  })

  await recordDecision({
    productId: input.productId,
    actor: 'human',
    decision: 'REJECT',
    rationale: input.reason,
    inputsSnapshot: { postId: post.id, hook: post.hook },
  })
}

export async function editPost(input: {
  postId: string
  productId: string
  hook?: string
  body?: string
  cta?: string | null
  linkUrl?: string | null
}): Promise<void> {
  const post = await repo.findPost(input.postId)
  if (!post) throw new Error(`Post ${input.postId} não encontrado.`)
  if (post.productId !== input.productId) throw new Error('Post não pertence a este produto.')

  const updates: { hook?: string; body?: string; cta?: string | null; linkUrl?: string | null } = {}
  const editedFrom: string[] = []
  const editedTo: string[] = []

  if (input.hook !== undefined && input.hook !== post.hook) {
    updates.hook = input.hook
    editedFrom.push(`hook: "${post.hook}"`)
    editedTo.push(`hook: "${input.hook}"`)
  }
  if (input.body !== undefined && input.body !== post.body) {
    updates.body = input.body
    editedFrom.push('body')
    editedTo.push('body')
  }
  if (input.cta !== undefined && input.cta !== post.cta) {
    updates.cta = input.cta
    editedFrom.push('cta')
    editedTo.push('cta')
  }
  if (input.linkUrl !== undefined && input.linkUrl !== post.linkUrl) {
    updates.linkUrl = input.linkUrl
    editedFrom.push(`linkUrl: "${post.linkUrl}"`)
    editedTo.push(`linkUrl: "${input.linkUrl}"`)
  }

  if (Object.keys(updates).length === 0) return

  await repo.setPostBody(post.id, updates)
  await insertFeedback({
    productId: input.productId,
    postId: post.id,
    action: 'edited',
    editedFrom: editedFrom.join('; '),
    editedTo: editedTo.join('; '),
  })

  // Regenera fingerprints do hook editado
  if (updates.hook) {
    const { normalizedText, hash } = prepareFingerprint(updates.hook, 'hook')
    await insertFingerprints([
      { productId: input.productId, postId: post.id, kind: 'hook', normalizedText, hash },
    ])
  }
}

export async function rejectIdea(input: {
  ideaId: string
  productId: string
  reason: string
}): Promise<void> {
  if (!input.reason.trim()) {
    throw new Error('Motivo de rejeição é obrigatório.')
  }

  await repo.setIdeaStatus(input.ideaId, 'rejected', input.reason)
  await insertFeedback({
    productId: input.productId,
    ideaId: input.ideaId,
    action: 'rejected',
    reason: input.reason,
  })
}

/** Cria um experimento já com variantes — instanciação, sem nova regra de motor. */
export async function createExperimentWithVariants(input: {
  productId: string
  campaignId?: string | null
  name: string
  hypothesis?: string | null
  dimension?: string
  primaryMetric?: string
  minSamplePerVariant?: number
  variants: Array<{
    label: string
    name: string
    description?: string | null
    spec: Record<string, unknown>
    isControl?: boolean
  }>
}): Promise<{ experiment: Experiment; variants: ExperimentVariant[] }> {
  const experiment = await repo.insertExperiment(input)
  const variants = await repo.insertExperimentVariants(experiment.id, input.variants)
  return { experiment, variants }
}

export {
  listPosts,
  findPost,
  listIdeas,
  findIdea,
  recentPostsMemory,
  recentRejectionReasons,
  recentAngleUsage,
  findExperiment,
  listExperimentVariants,
  startExperimentById,
  setPostVariant,
  hasAnyExperiment,
} from './repo'
