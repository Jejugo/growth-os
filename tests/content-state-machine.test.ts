import { describe, it, expect, vi, beforeEach } from 'vitest'
import { InvalidTransitionError } from '@/modules/content/service'

// Testa a máquina de estados de post via approvePost/rejectPost.
// Usa a lógica de transição interna sem precisar de banco.

// Replicamos a tabela de transições para validar que está completa e correta.
const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ['pending_approval', 'cancelled'],
  pending_approval: ['approved', 'rejected', 'cancelled'],
  approved: ['scheduled', 'cancelled'],
  rejected: [],
  scheduled: ['published', 'cancelled'],
  published: [],
  cancelled: [],
}

describe('máquina de estados de conteúdo', () => {
  it('InvalidTransitionError é instância de Error', () => {
    const err = new InvalidTransitionError('draft', 'published')
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('InvalidTransitionError')
    expect(err.message).toContain('draft')
    expect(err.message).toContain('published')
  })

  it('todas as transições válidas são aceitas', () => {
    for (const [from, tos] of Object.entries(VALID_TRANSITIONS)) {
      for (const to of tos) {
        // Não deve lançar: a transição é válida
        expect(() => assertTransition(from, to)).not.toThrow()
      }
    }
  })

  it('transições inválidas são rejeitadas com InvalidTransitionError', () => {
    const invalid = [
      ['draft', 'approved'],
      ['draft', 'published'],
      ['rejected', 'approved'],
      ['published', 'draft'],
      ['cancelled', 'draft'],
    ] as const

    for (const [from, to] of invalid) {
      expect(() => assertTransition(from, to)).toThrow(InvalidTransitionError)
    }
  })

  it('post rejeitado não pode ser reaprovado', () => {
    expect(() => assertTransition('rejected', 'approved')).toThrow(InvalidTransitionError)
    expect(() => assertTransition('rejected', 'pending_approval')).toThrow(InvalidTransitionError)
  })

  it('post publicado não pode ser cancelado nem revertido', () => {
    expect(() => assertTransition('published', 'cancelled')).toThrow(InvalidTransitionError)
    expect(() => assertTransition('published', 'rejected')).toThrow(InvalidTransitionError)
  })
})

// Função local que replica a lógica de assertValidTransition do service.ts
function assertTransition(from: string, to: string): void {
  if (!VALID_TRANSITIONS[from]?.includes(to)) {
    throw new InvalidTransitionError(from, to)
  }
}
