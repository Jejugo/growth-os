import { randomUUID, createHash } from 'node:crypto'

/**
 * IDs são sempre gerados por nós, nunca pelo LLM (init.md §31, regra 8).
 * UUID v4 do runtime; se algum dia a ordenação temporal importar para índices,
 * trocar por v7 aqui é uma mudança de uma linha.
 */
export function newId(): string {
  return randomUUID()
}

export function sha256(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex')
}

/** Código curto e legível para chaves de idempotência e logs. */
export function shortHash(input: string, length = 12): string {
  return sha256(input).slice(0, length)
}
