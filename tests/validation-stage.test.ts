import { describe, it, expect } from 'vitest'
import {
  STAGE_TRANSITIONS,
  assertValidStageTransition,
  InvalidStageTransitionError,
} from '@/modules/validation/service'
import type { ProductStage } from '@/modules/products/schema'

const STAGES: ProductStage[] = ['idea', 'validating', 'building', 'launched']

describe('máquina de estados de estágio do produto', () => {
  it('o fluxo é estritamente linear: idea → validating → building → launched', () => {
    expect(STAGE_TRANSITIONS.idea).toEqual(['validating'])
    expect(STAGE_TRANSITIONS.validating).toEqual(['building'])
    expect(STAGE_TRANSITIONS.building).toEqual(['launched'])
    expect(STAGE_TRANSITIONS.launched).toEqual([])
  })

  it('todas as transições declaradas são aceitas', () => {
    for (const [from, tos] of Object.entries(STAGE_TRANSITIONS)) {
      for (const to of tos) {
        expect(() => assertValidStageTransition(from as ProductStage, to as ProductStage)).not.toThrow()
      }
    }
  })

  it('não existe salto de estágio (ex.: idea direto para building)', () => {
    expect(() => assertValidStageTransition('idea', 'building')).toThrow(InvalidStageTransitionError)
    expect(() => assertValidStageTransition('idea', 'launched')).toThrow(InvalidStageTransitionError)
    expect(() => assertValidStageTransition('validating', 'launched')).toThrow(InvalidStageTransitionError)
  })

  it('não existe retrocesso de estágio', () => {
    expect(() => assertValidStageTransition('validating', 'idea')).toThrow(InvalidStageTransitionError)
    expect(() => assertValidStageTransition('building', 'validating')).toThrow(InvalidStageTransitionError)
    expect(() => assertValidStageTransition('launched', 'building')).toThrow(InvalidStageTransitionError)
  })

  it("'launched' é terminal — nenhuma transição sai dele", () => {
    for (const to of STAGES) {
      expect(() => assertValidStageTransition('launched', to)).toThrow(InvalidStageTransitionError)
    }
  })

  it('nenhum estágio transiciona para si mesmo', () => {
    for (const s of STAGES) {
      expect(() => assertValidStageTransition(s, s)).toThrow(InvalidStageTransitionError)
    }
  })
})
