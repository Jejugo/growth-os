import { describe, it, expect } from 'vitest'
import { mergeProfile, type ProfileValues } from '@/modules/products/service'
import type { ProfileData } from '@/modules/products/types'

const emptyData: ProfileData = {
  tagline: null,
  targetUsers: [],
  industries: [],
  useCases: [],
  differentiators: [],
  ctas: [],
  competitors: [],
  keywords: [],
  objections: [],
  contentThemes: [],
  pricingTiers: [],
  featuresListed: [],
  integrationsMentioned: [],
  socialProof: [],
}

function values(over: Partial<ProfileValues> = {}): ProfileValues {
  return {
    productName: 'IA',
    oneLiner: 'linha da IA',
    primaryProblem: 'problema da IA',
    valueProposition: 'valor da IA',
    pricingSummary: 'grátis',
    data: { ...emptyData },
    ...over,
  }
}

describe('mergeProfile', () => {
  it('sem perfil anterior, usa a saída da IA e marca origem ai', () => {
    const result = mergeProfile(values(), null)
    expect(result.source).toBe('ai')
    expect(result.lockedFields).toEqual([])
    expect(result.values.primaryProblem).toBe('problema da IA')
  })

  it('sem campos travados, a IA sobrescreve tudo', () => {
    const current = { ...values({ primaryProblem: 'texto antigo' }), lockedFields: [] }
    const result = mergeProfile(values(), current)
    expect(result.source).toBe('ai')
    expect(result.values.primaryProblem).toBe('problema da IA')
  })

  it('preserva campo-coluna travado e atualiza o resto', () => {
    const current = {
      ...values({ primaryProblem: 'escrito à mão', oneLiner: 'linha antiga' }),
      lockedFields: ['primaryProblem'],
    }

    const result = mergeProfile(values(), current)

    expect(result.source).toBe('merged')
    expect(result.values.primaryProblem).toBe('escrito à mão')
    expect(result.values.oneLiner).toBe('linha da IA')
    expect(result.lockedFields).toEqual(['primaryProblem'])
  })

  it('preserva campo dentro do JSONB', () => {
    const current = {
      ...values({ data: { ...emptyData, targetUsers: ['dev sênior no Brasil'] } }),
      lockedFields: ['targetUsers'],
    }
    const incoming = values({ data: { ...emptyData, targetUsers: ['empresas'], industries: ['SaaS'] } })

    const result = mergeProfile(incoming, current)

    expect(result.values.data.targetUsers).toEqual(['dev sênior no Brasil'])
    expect(result.values.data.industries).toEqual(['SaaS'])
  })

  it('preserva vários campos travados de origens diferentes', () => {
    const current = {
      ...values({
        pricingSummary: 'preço corrigido',
        data: { ...emptyData, competitors: ['Concorrente A'] },
      }),
      lockedFields: ['pricingSummary', 'competitors'],
    }

    const result = mergeProfile(values(), current)

    expect(result.values.pricingSummary).toBe('preço corrigido')
    expect(result.values.data.competitors).toEqual(['Concorrente A'])
    expect(result.values.productName).toBe('IA')
  })

  it('ignora nome de campo desconhecido em lockedFields', () => {
    const current = { ...values(), lockedFields: ['campoQueNaoExiste', 'oneLiner'] }
    const result = mergeProfile(values({ oneLiner: 'nova' }), current)

    expect(result.lockedFields).toEqual(['oneLiner'])
    expect(result.values.oneLiner).toBe('linha da IA')
  })

  it('travar um campo que a IA passou a devolver null mantém o valor humano', () => {
    const current = { ...values({ pricingSummary: 'US$ 29/mês' }), lockedFields: ['pricingSummary'] }
    const result = mergeProfile(values({ pricingSummary: null }), current)

    expect(result.values.pricingSummary).toBe('US$ 29/mês')
  })
})
