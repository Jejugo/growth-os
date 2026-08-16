import { describe, it, expect, vi, beforeEach } from 'vitest'
import { normalizeText, fingerprintHash, prepareFingerprint, DUPLICATE_THRESHOLD, NEAR_DUPLICATE_THRESHOLD } from '@/modules/content/dedupe'

// A deduplicação determinística é testável sem banco: só testamos a normalização
// e o hash aqui. O checkDedupe (que envolve banco) é testado por integração separada.

describe('normalizeText', () => {
  it('converte para minúsculas e remove pontuação', () => {
    const result = normalizeText('Olá, mundo! Teste.')
    expect(result).not.toContain(',')
    expect(result).not.toContain('!')
    expect(result).not.toContain('.')
    expect(result).toBe(result.toLowerCase())
  })

  it('remove stopwords em português', () => {
    const result = normalizeText('Como fazer isso de forma mais eficiente')
    expect(result).not.toContain(' de ')
    expect(result).not.toContain(' mais ')
  })

  it('remove emoji', () => {
    const result = normalizeText('🚀 Crescimento acelerado 💪')
    expect(result).not.toMatch(/\p{Emoji}/u)
  })

  it('pares idênticos produzem o mesmo texto normalizado', () => {
    const t1 = normalizeText('Reduza seu tempo de onboarding em 50%')
    const t2 = normalizeText('Reduza seu tempo de onboarding em 50%')
    expect(t1).toBe(t2)
  })

  it('texto com palavras reordenadas produz hash diferente sem sort', () => {
    const t1 = normalizeText('onboarding rápido clientes', false)
    const t2 = normalizeText('clientes onboarding rápido', false)
    expect(t1).not.toBe(t2)
  })

  it('argumento com palavras reordenadas produz mesmo resultado com sort=true', () => {
    const t1 = normalizeText('onboarding rápido clientes', true)
    const t2 = normalizeText('clientes rápido onboarding', true)
    expect(t1).toBe(t2)
  })
})

describe('fingerprintHash', () => {
  it('mesma entrada produz mesmo hash', () => {
    const h1 = fingerprintHash('texto teste')
    const h2 = fingerprintHash('texto teste')
    expect(h1).toBe(h2)
  })

  it('entradas distintas produzem hashes distintos', () => {
    const h1 = fingerprintHash('texto teste')
    const h2 = fingerprintHash('outro texto completamente diferente')
    expect(h1).not.toBe(h2)
  })

  it('hash tem comprimento de sha256 hex (64 chars)', () => {
    const h = fingerprintHash('qualquer coisa')
    expect(h).toHaveLength(64)
  })
})

describe('prepareFingerprint', () => {
  it('retorna normalizedText e hash consistentes', () => {
    const { normalizedText, hash } = prepareFingerprint('Hook de teste para o post', 'hook')
    expect(hash).toBe(fingerprintHash(normalizedText))
    expect(normalizedText.length).toBeGreaterThan(0)
  })

  it('argumento ordena tokens (invariância de ordem)', () => {
    const fp1 = prepareFingerprint('reduz custos melhora performance', 'argument')
    const fp2 = prepareFingerprint('melhora performance reduz custos', 'argument')
    expect(fp1.hash).toBe(fp2.hash)
  })

  it('hook NÃO ordena tokens (preserva semântica)', () => {
    const fp1 = prepareFingerprint('como crescer sem gastar', 'hook')
    const fp2 = prepareFingerprint('gastar sem crescer como', 'hook')
    expect(fp1.hash).not.toBe(fp2.hash)
  })
})

describe('limiares de dedupe', () => {
  it('DUPLICATE_THRESHOLD é 0.75', () => {
    expect(DUPLICATE_THRESHOLD).toBe(0.75)
  })

  it('NEAR_DUPLICATE_THRESHOLD é 0.6', () => {
    expect(NEAR_DUPLICATE_THRESHOLD).toBe(0.6)
  })
})
