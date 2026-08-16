import { env } from '@/lib/env'
import { sha256 } from '@/lib/ids'
import { assertPublicHost, InvalidUrlError } from './url'
import { extractPage, LOW_CONTENT_THRESHOLD } from './extract'

export const MAX_PAGES = 6
const FETCH_TIMEOUT_MS = 10_000
const MAX_REDIRECTS = 3
const MIN_INTERVAL_MS = 1_000
const MAX_BYTES = 2_000_000

export type PageRole = 'home' | 'pricing' | 'features' | 'about' | 'docs' | 'blog' | 'other'

export interface CrawledPage {
  pageUrl: string
  pageRole: PageRole
  httpStatus: number
  title: string | null
  extractedText: string
  contentHash: string
}

export interface CrawlResult {
  pages: CrawledPage[]
  /** HTML praticamente vazio em todas as páginas — provável SPA sem SSR. */
  lowContent: boolean
  skipped: Array<{ url: string; reason: string }>
}

/** Ordem importa: define a prioridade quando há mais candidatas que vagas. */
const ROLE_PATTERNS: Array<{ role: PageRole; test: RegExp }> = [
  { role: 'pricing', test: /\/(pricing|plans|precos|planos)(\/|$)/i },
  { role: 'features', test: /\/(features|product|solutions|use-cases|how-it-works|recursos)(\/|$)/i },
  { role: 'about', test: /\/(about|about-us|company|sobre)(\/|$)/i },
  { role: 'docs', test: /\/(docs|documentation|guide)(\/|$)/i },
  { role: 'blog', test: /\/(blog|changelog|news)(\/|$)/i },
]

function roleFor(url: string, homeUrl: string): PageRole {
  if (url === homeUrl) return 'home'
  const path = new URL(url).pathname
  for (const { role, test } of ROLE_PATTERNS) if (test.test(path)) return role
  return 'other'
}

// --- fetch educado -------------------------------------------------------

let lastRequestAt = 0

async function throttle(): Promise<void> {
  const wait = MIN_INTERVAL_MS - (Date.now() - lastRequestAt)
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  lastRequestAt = Date.now()
}

interface FetchedPage {
  finalUrl: string
  status: number
  body: string
}

/**
 * Busca uma URL seguindo redirects manualmente. Cada hop passa pela guarda de
 * SSRF de novo — um domínio público pode redirecionar para um IP interno, e
 * `redirect: 'follow'` esconderia isso.
 */
async function politeFetch(url: string): Promise<FetchedPage> {
  let current = url

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const parsed = new URL(current)
    await assertPublicHost(parsed.hostname)
    await throttle()

    const response = await fetch(current, {
      redirect: 'manual',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        'user-agent': env().CRAWLER_USER_AGENT,
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'en;q=0.9,pt-BR;q=0.8',
      },
    })

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (!location) return { finalUrl: current, status: response.status, body: '' }
      current = new URL(location, current).toString()
      continue
    }

    const contentType = response.headers.get('content-type') ?? ''
    const isText = contentType.includes('html') || contentType.includes('xml') || contentType === ''
    if (!response.ok || !isText) {
      return { finalUrl: current, status: response.status, body: '' }
    }

    const body = (await response.text()).slice(0, MAX_BYTES)
    return { finalUrl: current, status: response.status, body }
  }

  throw new InvalidUrlError(`Excesso de redirects a partir de ${url}`)
}

// --- robots.txt ----------------------------------------------------------

interface Robots {
  isAllowed(pathname: string): boolean
}

const ALLOW_ALL: Robots = { isAllowed: () => true }

/**
 * Parser mínimo de robots.txt: agrupa por user-agent e coleta Disallow para
 * `*` e para o nosso agente. Não cobre wildcards nem Allow — na dúvida, o
 * comportamento é recusar (mais educado do que adivinhar).
 */
export function parseRobots(body: string, userAgentToken: string): Robots {
  const groups = new Map<string, string[]>()
  let currentAgents: string[] = []

  for (const rawLine of body.split('\n')) {
    const line = rawLine.split('#')[0]?.trim() ?? ''
    if (!line) continue
    const separator = line.indexOf(':')
    if (separator === -1) continue

    const field = line.slice(0, separator).trim().toLowerCase()
    const value = line.slice(separator + 1).trim()

    if (field === 'user-agent') {
      currentAgents = [value.toLowerCase()]
      for (const agent of currentAgents) if (!groups.has(agent)) groups.set(agent, [])
    } else if (field === 'disallow' && currentAgents.length > 0) {
      for (const agent of currentAgents) groups.get(agent)?.push(value)
    }
  }

  const token = userAgentToken.toLowerCase()
  const rules = groups.get(token) ?? groups.get('*') ?? []
  const blocked = rules.filter((r) => r.length > 0)

  return {
    isAllowed(pathname: string) {
      return !blocked.some((rule) => pathname.startsWith(rule))
    },
  }
}

async function loadRobots(origin: string): Promise<Robots> {
  try {
    const { status, body } = await politeFetch(`${origin}/robots.txt`)
    if (status !== 200 || !body) return ALLOW_ALL
    const token = env().CRAWLER_USER_AGENT.split('/')[0] ?? 'GrowthOSBot'
    return parseRobots(body, token)
  } catch {
    // Sem robots.txt legível, seguimos com os demais limites (6 páginas, 1 req/s).
    return ALLOW_ALL
  }
}

// --- descoberta ----------------------------------------------------------

async function fromSitemap(origin: string): Promise<string[]> {
  try {
    const { status, body } = await politeFetch(`${origin}/sitemap.xml`)
    if (status !== 200 || !body) return []
    const urls: string[] = []
    for (const match of body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)) {
      const loc = match[1]
      if (loc) urls.push(loc)
    }
    return urls
  } catch {
    return []
  }
}

/**
 * Escolhe até `MAX_PAGES` URLs: a home sempre, depois uma por papel na ordem
 * de `ROLE_PATTERNS`. Priorizar por papel em vez de por ordem de descoberta
 * evita gastar as 6 vagas em seis posts de blog.
 */
function selectPages(homeUrl: string, candidates: string[], robots: Robots): string[] {
  const home = new URL(homeUrl)
  const selected = [homeUrl]
  const seenRoles = new Set<PageRole>(['home'])

  const sameOrigin = candidates.filter((candidate) => {
    try {
      const url = new URL(candidate)
      if (url.origin !== home.origin) return false
      if (!robots.isAllowed(url.pathname)) return false
      if (/\.(pdf|zip|png|jpe?g|gif|svg|webp|mp4|css|js)$/i.test(url.pathname)) return false
      return true
    } catch {
      return false
    }
  })

  const normalized = sameOrigin.map((u) => {
    const url = new URL(u)
    url.hash = ''
    url.search = ''
    return `${url.origin}${url.pathname.replace(/\/+$/, '')}`
  })

  for (const { role } of ROLE_PATTERNS) {
    if (selected.length >= MAX_PAGES) break
    if (seenRoles.has(role)) continue
    const match = normalized.find((u) => roleFor(u, homeUrl) === role && !selected.includes(u))
    if (match) {
      selected.push(match)
      seenRoles.add(role)
    }
  }

  return selected.slice(0, MAX_PAGES)
}

// --- ponto de entrada ----------------------------------------------------

export async function crawlProductSite(homeUrl: string): Promise<CrawlResult> {
  const origin = new URL(homeUrl).origin
  const robots = await loadRobots(origin)

  if (!robots.isAllowed(new URL(homeUrl).pathname)) {
    throw new InvalidUrlError('robots.txt do site bloqueia a leitura da home.')
  }

  const home = await politeFetch(homeUrl)
  const skipped: Array<{ url: string; reason: string }> = []

  if (home.status !== 200 || !home.body) {
    throw new InvalidUrlError(`O site respondeu ${home.status} sem conteúdo HTML utilizável.`)
  }

  const homePage = extractPage(home.body, home.finalUrl)
  const sitemapUrls = await fromSitemap(origin)
  const candidates = [...sitemapUrls, ...homePage.links]
  const targets = selectPages(homeUrl, candidates, robots).filter((u) => u !== homeUrl)

  const pages: CrawledPage[] = [
    {
      pageUrl: homeUrl,
      pageRole: 'home',
      httpStatus: home.status,
      title: homePage.title,
      extractedText: homePage.text,
      contentHash: sha256(homePage.text),
    },
  ]

  for (const target of targets) {
    try {
      const fetched = await politeFetch(target)
      if (fetched.status !== 200 || !fetched.body) {
        skipped.push({ url: target, reason: `HTTP ${fetched.status}` })
        continue
      }
      const page = extractPage(fetched.body, fetched.finalUrl)
      pages.push({
        pageUrl: target,
        pageRole: roleFor(target, homeUrl),
        httpStatus: fetched.status,
        title: page.title,
        extractedText: page.text,
        contentHash: sha256(page.text),
      })
    } catch (error) {
      skipped.push({ url: target, reason: error instanceof Error ? error.message : 'erro' })
    }
  }

  const totalChars = pages.reduce((sum, p) => sum + p.extractedText.length, 0)

  return { pages, lowContent: totalChars < LOW_CONTENT_THRESHOLD, skipped }
}
