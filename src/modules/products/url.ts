import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

export class InvalidUrlError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidUrlError'
  }
}

/**
 * Normaliza a URL de um SaaS para forma canônica: https, host minúsculo, sem
 * porta default, sem query, sem fragmento, sem barra final.
 *
 * A query cai fora de propósito: `?utm_source=...` criaria dois "produtos"
 * para o mesmo site e quebraria a unicidade por domínio.
 */
export function normalizeProductUrl(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) throw new InvalidUrlError('URL vazia.')

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`

  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    throw new InvalidUrlError(`URL malformada: ${input}`)
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new InvalidUrlError(`Protocolo não suportado: ${url.protocol}`)
  }
  if (!url.hostname) throw new InvalidUrlError('URL sem host.')
  if (!url.hostname.includes('.') && url.hostname !== 'localhost') {
    throw new InvalidUrlError(`Host inválido: ${url.hostname}`)
  }

  url.protocol = 'https:'
  url.hostname = url.hostname.toLowerCase()
  url.port = ''
  url.search = ''
  url.hash = ''
  url.username = ''
  url.password = ''

  const path = url.pathname.replace(/\/+$/, '')
  return `${url.origin}${path}`
}

/** Domínio canônico, sem `www.` — a chave de unicidade de um produto. */
export function domainOf(normalizedUrl: string): string {
  return new URL(normalizedUrl).hostname.replace(/^www\./, '')
}

// --- Guarda de SSRF ------------------------------------------------------

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true
  const [a = 0, b = 0] = parts
  if (a === 0) return true // 0.0.0.0/8
  if (a === 10) return true // privado
  if (a === 127) return true // loopback
  if (a === 169 && b === 254) return true // link-local (inclui metadata 169.254.169.254)
  if (a === 172 && b >= 16 && b <= 31) return true // privado
  if (a === 192 && b === 168) return true // privado
  if (a === 192 && b === 0) return true // IETF protocol assignments
  if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
  if (a === 198 && (b === 18 || b === 19)) return true // benchmarking
  if (a >= 224) return true // multicast e reservado
  return false
}

function isPrivateIpv6(ip: string): boolean {
  const addr = ip.toLowerCase().split('%')[0] ?? ''
  if (addr === '::' || addr === '::1') return true
  // IPv4 mapeado (::ffff:10.0.0.1) — decide pelas regras do IPv4.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(addr)
  if (mapped?.[1]) return isPrivateIpv4(mapped[1])
  if (/^f[cd]/.test(addr)) return true // ULA fc00::/7
  if (/^fe[89ab]/.test(addr)) return true // link-local fe80::/10
  if (addr.startsWith('ff')) return true // multicast
  return false
}

export function isPrivateAddress(ip: string): boolean {
  const version = isIP(ip)
  if (version === 4) return isPrivateIpv4(ip)
  if (version === 6) return isPrivateIpv6(ip)
  return true // não é IP reconhecível — trate como inseguro
}

/**
 * Resolve o host e recusa endereços internos. Precisa rodar em cada hop de
 * redirect: um domínio público pode redirecionar para 169.254.169.254.
 */
export async function assertPublicHost(hostname: string): Promise<void> {
  const host = hostname.toLowerCase()
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) {
    throw new InvalidUrlError(`Host interno bloqueado: ${hostname}`)
  }

  if (isIP(host)) {
    if (isPrivateAddress(host)) throw new InvalidUrlError(`Endereço interno bloqueado: ${host}`)
    return
  }

  let addresses: Array<{ address: string }>
  try {
    addresses = await lookup(host, { all: true })
  } catch {
    throw new InvalidUrlError(`Não foi possível resolver o host: ${hostname}`)
  }

  if (addresses.length === 0) throw new InvalidUrlError(`Host sem endereços: ${hostname}`)
  for (const { address } of addresses) {
    if (isPrivateAddress(address)) {
      throw new InvalidUrlError(`Host resolve para endereço interno (${address}): ${hostname}`)
    }
  }
}
