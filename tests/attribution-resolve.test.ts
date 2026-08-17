import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock do módulo de repo antes de importar resolve
vi.mock('@/modules/attribution/repo', () => ({
  findTrackingLinkByRef: vi.fn(),
  findLastVisitorLink: vi.fn(),
}))

import { resolveAttribution } from '@/modules/attribution/resolve'
import { findTrackingLinkByRef, findLastVisitorLink } from '@/modules/attribution/repo'
import type { TrackingLink } from '@/modules/attribution/schema'

const mockRef = findTrackingLinkByRef as ReturnType<typeof vi.fn>
const mockLast = findLastVisitorLink as ReturnType<typeof vi.fn>

const stubLink: TrackingLink = {
  id: 'link_001',
  productId: 'prod_A',
  campaignId: 'cmp_1',
  postId: 'post_1',
  publicationId: 'pub_1',
  code: 'ABCD1234',
  destinationUrl: 'https://exemplo.com',
  generatedUrl: 'https://exemplo.com?utm_source=bluesky',
  utmSource: 'bluesky',
  utmMedium: 'social',
  utmCampaign: 'cmp_1',
  utmContent: null,
  ref: 'gr_aabbccdd',
  clickCount: 0,
  createdAt: new Date(),
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('resolveAttribution', () => {
  describe('direct attribution via ref', () => {
    it('ref válido → model direct com dados do link', async () => {
      mockRef.mockResolvedValue(stubLink)

      const result = await resolveAttribution({
        ref: 'gr_aabbccdd',
        visitorId: null,
        productId: 'prod_A',
      })

      expect(result.model).toBe('direct')
      expect(result.trackingLinkId).toBe('link_001')
      expect(result.campaignId).toBe('cmp_1')
      expect(result.postId).toBe('post_1')
      expect(result.channel).toBe('bluesky')
      expect(mockRef).toHaveBeenCalledWith('gr_aabbccdd', 'prod_A')
    })

    it('ref de outro produto (não encontrado) → none', async () => {
      mockRef.mockResolvedValue(null)

      const result = await resolveAttribution({
        ref: 'gr_outroprod',
        visitorId: null,
        productId: 'prod_A',
      })

      expect(result.model).toBe('none')
      expect(result.trackingLinkId).toBeUndefined()
    })

    it('ref inexistente → none', async () => {
      mockRef.mockResolvedValue(null)

      const result = await resolveAttribution({
        ref: 'gr_invalido',
        visitorId: 'vid_123',
        productId: 'prod_A',
      })

      // Mesmo com visitorId presente, ref tem prioridade e falhou → none
      expect(result.model).toBe('none')
      // Não consulta last_touch quando ref foi fornecido
      expect(mockLast).not.toHaveBeenCalled()
    })
  })

  describe('last_touch attribution via visitorId', () => {
    it('vid com visita dentro de 30 dias → last_touch', async () => {
      mockRef.mockResolvedValue(null) // sem ref
      mockLast.mockResolvedValue(stubLink)

      const result = await resolveAttribution({
        ref: null,
        visitorId: 'vid_123',
        productId: 'prod_A',
      })

      expect(result.model).toBe('last_touch')
      expect(result.trackingLinkId).toBe('link_001')
      expect(result.campaignId).toBe('cmp_1')
    })

    it('vid com última visita há 31 dias (fora da janela) → none', async () => {
      // findLastVisitorLink retorna null quando não há visita dentro da janela
      mockLast.mockResolvedValue(null)

      const result = await resolveAttribution({
        ref: null,
        visitorId: 'vid_old',
        productId: 'prod_A',
      })

      expect(result.model).toBe('none')
    })

    it('vid presente mas sem link associado → none', async () => {
      mockLast.mockResolvedValue(null)

      const result = await resolveAttribution({
        ref: null,
        visitorId: 'vid_sem_link',
        productId: 'prod_A',
      })

      expect(result.model).toBe('none')
    })
  })

  describe('sem contexto', () => {
    it('nem ref nem visitorId → none', async () => {
      const result = await resolveAttribution({
        ref: null,
        visitorId: null,
        productId: 'prod_A',
      })

      expect(result.model).toBe('none')
      expect(mockRef).not.toHaveBeenCalled()
      expect(mockLast).not.toHaveBeenCalled()
    })

    it('ref e visitorId ambos undefined → none', async () => {
      const result = await resolveAttribution({
        ref: undefined,
        visitorId: undefined,
        productId: 'prod_A',
      })

      expect(result.model).toBe('none')
    })
  })
})
