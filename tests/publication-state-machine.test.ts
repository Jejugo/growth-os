import { describe, it, expect } from 'vitest'

/**
 * Máquina de estados de publicação.
 * Conforme o plano: status enum('scheduled','publishing','published','failed','unknown','cancelled')
 *
 * Transições válidas:
 *  scheduled  → publishing, cancelled
 *  publishing → published, failed, unknown, scheduled (retry com backoff)
 *  published  → (terminal)
 *  failed     → scheduled (reagendamento manual), cancelled
 *  unknown    → published (reconciliação), failed (reconciliação falhou), cancelled
 *  cancelled  → (terminal)
 */

type PublicationStatus = 'scheduled' | 'publishing' | 'published' | 'failed' | 'unknown' | 'cancelled'

const VALID_TRANSITIONS: Record<PublicationStatus, PublicationStatus[]> = {
  scheduled: ['publishing', 'cancelled'],
  publishing: ['published', 'failed', 'unknown', 'scheduled'],
  published: [],
  failed: ['scheduled', 'cancelled'],
  unknown: ['published', 'failed', 'cancelled'],
  cancelled: [],
}

function assertTransition(from: PublicationStatus, to: PublicationStatus): void {
  if (!VALID_TRANSITIONS[from].includes(to)) {
    throw new InvalidPublicationTransitionError(from, to)
  }
}

class InvalidPublicationTransitionError extends Error {
  constructor(from: string, to: string) {
    super(`Transição inválida de publicação: ${from} → ${to}`)
    this.name = 'InvalidPublicationTransitionError'
  }
}

describe('máquina de estados de publicação', () => {
  it('todas as transições válidas são aceitas', () => {
    for (const [from, tos] of Object.entries(VALID_TRANSITIONS)) {
      for (const to of tos) {
        expect(() => assertTransition(from as PublicationStatus, to as PublicationStatus)).not.toThrow()
      }
    }
  })

  it('transições inválidas lançam erro', () => {
    const invalid: Array<[PublicationStatus, PublicationStatus]> = [
      ['scheduled', 'published'],
      ['scheduled', 'failed'],
      ['published', 'scheduled'],
      ['published', 'cancelled'],
      ['cancelled', 'scheduled'],
    ]
    for (const [from, to] of invalid) {
      expect(() => assertTransition(from, to)).toThrow(InvalidPublicationTransitionError)
    }
  })

  it('scheduled → publishing é o único claim válido', () => {
    expect(() => assertTransition('scheduled', 'publishing')).not.toThrow()
    expect(() => assertTransition('published', 'publishing')).toThrow()
    expect(() => assertTransition('cancelled', 'publishing')).toThrow()
  })

  it('published é terminal', () => {
    for (const status of Object.keys(VALID_TRANSITIONS) as PublicationStatus[]) {
      if (status !== 'publishing' && status !== 'unknown' && status !== 'failed') {
        expect(() => assertTransition('published', status)).toThrow()
      }
    }
  })

  it('cancelled é terminal', () => {
    for (const status of Object.keys(VALID_TRANSITIONS) as PublicationStatus[]) {
      expect(() => assertTransition('cancelled', status)).toThrow()
    }
  })

  it('unknown pode ser resolvido por reconciliação (published ou failed)', () => {
    expect(() => assertTransition('unknown', 'published')).not.toThrow()
    expect(() => assertTransition('unknown', 'failed')).not.toThrow()
  })

  it('unknown NÃO pode ir diretamente para scheduled (sem retry automático)', () => {
    expect(() => assertTransition('unknown', 'scheduled')).toThrow()
  })
})
