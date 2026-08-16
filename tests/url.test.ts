import { describe, it, expect } from 'vitest'
import {
  normalizeProductUrl,
  domainOf,
  isPrivateAddress,
  InvalidUrlError,
} from '@/modules/products/url'

describe('normalizeProductUrl', () => {
  it('força https e remove query, fragmento e barra final', () => {
    expect(normalizeProductUrl('http://Exemplo.com/?utm_source=x#top')).toBe('https://exemplo.com')
  })

  it('aceita URL sem esquema', () => {
    expect(normalizeProductUrl('orbitjobs.com')).toBe('https://orbitjobs.com')
  })

  it('preserva o caminho, sem a barra final', () => {
    expect(normalizeProductUrl('https://exemplo.com/produto/')).toBe('https://exemplo.com/produto')
  })

  it('remove porta explícita', () => {
    expect(normalizeProductUrl('https://exemplo.com:443/pricing')).toBe(
      'https://exemplo.com/pricing',
    )
  })

  it('descarta credenciais embutidas na URL', () => {
    expect(normalizeProductUrl('https://user:pass@exemplo.com')).toBe('https://exemplo.com')
  })

  it('é idempotente', () => {
    const once = normalizeProductUrl('http://Exemplo.com/a/?b=1')
    expect(normalizeProductUrl(once)).toBe(once)
  })

  it.each([
    ['', 'vazia'],
    ['   ', 'só espaços'],
    ['ftp://exemplo.com', 'protocolo não suportado'],
    ['javascript:alert(1)', 'esquema perigoso'],
    ['não é uma url', 'texto solto'],
  ])('rejeita %s (%s)', (input) => {
    expect(() => normalizeProductUrl(input)).toThrow(InvalidUrlError)
  })
})

describe('domainOf', () => {
  it('remove www', () => {
    expect(domainOf('https://www.exemplo.com/a')).toBe('exemplo.com')
  })

  it('mantém subdomínio que não é www', () => {
    expect(domainOf('https://app.exemplo.com')).toBe('app.exemplo.com')
  })
})

describe('isPrivateAddress (guarda de SSRF)', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254', // metadata de nuvem — o alvo clássico
    '0.0.0.0',
    '100.64.0.1',
    '224.0.0.1',
    '::1',
    'fc00::1',
    'fe80::1',
    '::ffff:10.0.0.1', // IPv4 mapeado em IPv6
  ])('bloqueia %s', (ip) => {
    expect(isPrivateAddress(ip)).toBe(true)
  })

  it.each(['8.8.8.8', '1.1.1.1', '172.32.0.1', '192.169.0.1', '2606:4700::1111'])(
    'permite %s',
    (ip) => {
      expect(isPrivateAddress(ip)).toBe(false)
    },
  )

  it('trata entrada não reconhecível como insegura', () => {
    expect(isPrivateAddress('não-é-ip')).toBe(true)
  })
})
