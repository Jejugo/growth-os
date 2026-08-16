import { sha256 } from '@/lib/ids'
import { findExactFingerprint, findSimilarFingerprints } from './repo'
import type { ContentFingerprint } from './schema'
import type { DedupeVerdict } from './types'

// --- Normalização --------------------------------------------------------

const STOPWORDS = new Set([
  'a', 'o', 'e', 'é', 'de', 'do', 'da', 'dos', 'das', 'em', 'no', 'na',
  'nos', 'nas', 'um', 'uma', 'uns', 'umas', 'para', 'por', 'com', 'sem',
  'que', 'se', 'ou', 'mas', 'como', 'mais', 'muito', 'já', 'não', 'também',
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'in', 'on', 'at', 'to', 'for',
  'with', 'this', 'that', 'is', 'are', 'was', 'be', 'by', 'from',
])

const EMOJI_PATTERN = /\p{Emoji_Presentation}|\p{Extended_Pictographic}/gu
const PUNCT_PATTERN = /[^\p{L}\p{N}\s]/gu

/**
 * Normaliza texto para dedupe:
 * - lowercase
 * - remove emoji
 * - remove pontuação
 * - remove stopwords
 * - para argumentos: ordena tokens para invariância de ordem
 */
export function normalizeText(text: string, sort = false): string {
  const cleaned = text
    .toLowerCase()
    .replace(EMOJI_PATTERN, ' ')
    .replace(PUNCT_PATTERN, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const tokens = cleaned
    .split(' ')
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))

  const final = sort ? tokens.sort() : tokens
  return final.join(' ')
}

export function fingerprintHash(normalized: string): string {
  return sha256(normalized)
}

// --- Limiares ------------------------------------------------------------

/** > 0.75 em hook ou ideia → duplicata. */
export const DUPLICATE_THRESHOLD = 0.75
/** 0.6–0.75 → near_duplicate (vai para revisão humana). */
export const NEAR_DUPLICATE_THRESHOLD = 0.6

// --- Verificação ---------------------------------------------------------

export interface DedupeInput {
  productId: string
  kind: ContentFingerprint['kind']
  text: string
}

/**
 * Executa dedupe para um único texto.
 * 1. Normaliza
 * 2. Hash exato → colisão = duplicata imediata
 * 3. pg_trgm similarity → acima de 0.75 = duplicata; 0.6–0.75 = near_duplicate
 */
export async function checkDedupe(input: DedupeInput): Promise<DedupeVerdict> {
  const { productId, kind } = input
  // Argumentos têm tokens ordenados para invariância de ordem
  const sortTokens = kind === 'argument'
  const normalized = normalizeText(input.text, sortTokens)
  const hash = fingerprintHash(normalized)

  // 1. Hash exato
  const exact = await findExactFingerprint(productId, kind, hash)
  if (exact) {
    return {
      verdict: 'duplicate',
      existingId: exact.postId ?? exact.ideaId ?? exact.id,
      normalizedText: exact.normalizedText,
    }
  }

  // 2. Similaridade trigrama
  const similar = await findSimilarFingerprints(
    productId,
    kind,
    normalized,
    NEAR_DUPLICATE_THRESHOLD,
  )

  if (similar.length === 0) return { verdict: 'ok' }

  const top = similar[0]!

  if (top.similarity > DUPLICATE_THRESHOLD) {
    return {
      verdict: 'duplicate',
      existingId: top.postId ?? top.ideaId ?? top.id,
      normalizedText: top.normalizedText,
    }
  }

  return {
    verdict: 'near_duplicate',
    existingId: top.postId ?? top.ideaId ?? top.id,
    normalizedText: top.normalizedText,
    similarity: top.similarity,
  }
}

/**
 * Retorna o texto normalizado e o hash para salvar no banco.
 * Separado de checkDedupe para reaproveitar o cálculo sem nova query.
 */
export function prepareFingerprint(
  text: string,
  kind: ContentFingerprint['kind'],
): { normalizedText: string; hash: string } {
  const sortTokens = kind === 'argument'
  const normalizedText = normalizeText(text, sortTokens)
  const hash = fingerprintHash(normalizedText)
  return { normalizedText, hash }
}
