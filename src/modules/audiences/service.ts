import { recordDecision } from '@/lib/observability/service'
import { getCurrentProfile } from '@/modules/products'
import { deriveAudienceSegments } from './ai/derive-segments'
import * as repo from './repo'
import type { AudienceSegment } from './schema'

export class NoProfileError extends Error {
  constructor(productId: string) {
    super(`Produto ${productId} não tem perfil atual. Rode uma análise primeiro.`)
    this.name = 'NoProfileError'
  }
}

/**
 * Deriva segmentos de audiência a partir do perfil atual do produto.
 * Substitui segmentos existentes — a chamada é idempotente por design:
 * se já existem segmentos, o chamador decide se quer regerar.
 */
export async function deriveSegments(input: {
  productId: string
  jobRunId?: string
}): Promise<{ segments: AudienceSegment[]; costUsd: number }> {
  const { productId } = input

  const profile = await getCurrentProfile(productId)
  if (!profile) throw new NoProfileError(productId)

  const { segments: derived, callId, costUsd } = await deriveAudienceSegments({
    productId,
    profile,
  })

  const saved = await repo.insertSegments(productId, derived)

  await recordDecision({
    productId,
    actor: 'audience-analyst',
    decision: 'DERIVE_SEGMENTS',
    rationale: `Derivou ${saved.length} segmentos. Scores médios: fit=${avg(saved.map((s) => s.audienceFitScore))}, intensity=${avg(saved.map((s) => s.problemIntensityScore))}, conversion=${avg(saved.map((s) => s.conversionPotentialScore))}.`,
    aiCallId: callId,
    jobRunId: input.jobRunId,
  })

  return { segments: saved, costUsd }
}

export async function setSegmentStatus(
  id: string,
  status: 'active' | 'paused' | 'archived',
): Promise<void> {
  await repo.setSegmentStatus(id, status)
}

export { listSegments, findSegment, countActiveSegments } from './repo'

function avg(values: number[]): string {
  if (values.length === 0) return '0'
  return (values.reduce((a, b) => a + b, 0) / values.length).toFixed(0)
}
