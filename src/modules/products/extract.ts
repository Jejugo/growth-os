import * as cheerio from 'cheerio'

export const MAX_PAGE_CHARS = 30_000

/** Sinal de que o HTML veio vazio — típico de SPA sem SSR. */
export const LOW_CONTENT_THRESHOLD = 500

export interface ExtractedPage {
  title: string | null
  text: string
  links: string[]
}

const NOISE_SELECTORS = [
  'script',
  'style',
  'noscript',
  'svg',
  'iframe',
  'nav',
  'header',
  'footer',
  'aside',
  'form',
  '[aria-hidden="true"]',
  '[role="navigation"]',
  '[role="banner"]',
  '[role="contentinfo"]',
].join(',')

/**
 * HTML → texto legível. Sem Readability nem navegador headless: a heurística
 * "tire o ruído, prefira main/article, senão body" cobre a esmagadora maioria
 * das landing pages de SaaS, que é o que a Fase 0 precisa ler.
 */
export function extractPage(html: string, baseUrl: string): ExtractedPage {
  const $ = cheerio.load(html)

  const title =
    $('meta[property="og:title"]').attr('content')?.trim() ||
    $('title').first().text().trim() ||
    null

  const description =
    $('meta[name="description"]').attr('content')?.trim() ||
    $('meta[property="og:description"]').attr('content')?.trim() ||
    ''

  // Links são colhidos antes da limpeza — a navegação é justamente onde estão
  // os caminhos para /pricing e /features.
  const links = new Set<string>()
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href')
    if (!href) return
    try {
      const resolved = new URL(href, baseUrl)
      if (resolved.protocol === 'http:' || resolved.protocol === 'https:') {
        resolved.hash = ''
        links.add(resolved.toString())
      }
    } catch {
      // href relativo malformado — ignore
    }
  })

  $(NOISE_SELECTORS).remove()

  const main = $('main').first()
  const article = $('article').first()
  const root = main.length > 0 ? main : article.length > 0 ? article : $('body')

  const body = collapse(root.text())
  const text = [description, body].filter(Boolean).join('\n\n').slice(0, MAX_PAGE_CHARS)

  return { title, text, links: [...links] }
}

function collapse(text: string): string {
  return text
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.replace(/[ \t ]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
}
