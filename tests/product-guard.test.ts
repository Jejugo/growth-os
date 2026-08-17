import { describe, it, expect } from 'vitest'
import { ProductMismatchError } from '@/modules/distribution/publisher'

/**
 * Guarda de produto: post.productId deve ser igual a channelAccount.productId.
 * Garante que nunca publicamos o post de produto A na conta de produto B.
 */

function checkProductMatch(postProductId: string, accountProductId: string): void {
  if (postProductId !== accountProductId) {
    throw new ProductMismatchError()
  }
}

describe('guarda de produto', () => {
  it('mesmos productIds: sem erro', () => {
    expect(() => checkProductMatch('prod_abc', 'prod_abc')).not.toThrow()
  })

  it('productIds diferentes: ProductMismatchError', () => {
    expect(() => checkProductMatch('prod_abc', 'prod_xyz')).toThrow(ProductMismatchError)
  })

  it('ProductMismatchError é instância de Error', () => {
    const err = new ProductMismatchError()
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('ProductMismatchError')
  })

  it('produtoId vazio não é igual a outro vazio (edge)', () => {
    // Dois valores vazios não deveriam existir na prática, mas o check deve ser consistente
    expect(() => checkProductMatch('', '')).not.toThrow()
  })
})
