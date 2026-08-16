import { describe, it, expect } from 'vitest'
import { parseRobots } from '@/modules/products/crawler'
import { extractPage } from '@/modules/products/extract'
import { estimateCostUsd } from '@/modules/ai/config'
import { idempotencyKeyFor } from '@/trigger/analyze-product'

describe('parseRobots', () => {
  it('respeita Disallow do grupo *', () => {
    const robots = parseRobots('User-agent: *\nDisallow: /admin\nDisallow: /api', 'GrowthOSBot')
    expect(robots.isAllowed('/pricing')).toBe(true)
    expect(robots.isAllowed('/admin/users')).toBe(false)
    expect(robots.isAllowed('/api')).toBe(false)
  })

  it('grupo específico do nosso agente tem precedência sobre *', () => {
    const body = 'User-agent: *\nDisallow: /\n\nUser-agent: GrowthOSBot\nDisallow: /privado'
    const robots = parseRobots(body, 'GrowthOSBot')
    expect(robots.isAllowed('/pricing')).toBe(true)
    expect(robots.isAllowed('/privado')).toBe(false)
  })

  it('Disallow vazio significa liberado', () => {
    const robots = parseRobots('User-agent: *\nDisallow:', 'GrowthOSBot')
    expect(robots.isAllowed('/qualquer-coisa')).toBe(true)
  })

  it('ignora comentários e linhas malformadas', () => {
    const robots = parseRobots('# comentário\nlixo\nUser-agent: *\nDisallow: /x # nota', 'Bot')
    expect(robots.isAllowed('/x')).toBe(false)
    expect(robots.isAllowed('/y')).toBe(true)
  })

  it('robots.txt vazio libera tudo', () => {
    expect(parseRobots('', 'Bot').isAllowed('/qualquer')).toBe(true)
  })
})

describe('extractPage', () => {
  const html = `
    <html>
      <head>
        <title>Orbit Jobs</title>
        <meta name="description" content="Vagas remotas que realmente contratam LATAM." />
      </head>
      <body>
        <nav><a href="/pricing">Preços</a><a href="https://twitter.com/x">Twitter</a></nav>
        <main><h1>Encontre vagas remotas</h1><p>Descubra quem contrata na sua região.</p></main>
        <script>console.log('ruído')</script>
        <footer>Rodapé com ruído</footer>
      </body>
    </html>`

  it('extrai título, descrição e conteúdo principal', () => {
    const page = extractPage(html, 'https://orbitjobs.com')
    expect(page.title).toBe('Orbit Jobs')
    expect(page.text).toContain('Vagas remotas que realmente contratam LATAM.')
    expect(page.text).toContain('Encontre vagas remotas')
  })

  it('descarta script, nav e footer do texto', () => {
    const page = extractPage(html, 'https://orbitjobs.com')
    expect(page.text).not.toContain('ruído')
    expect(page.text).not.toContain('Rodapé')
  })

  it('colhe links da navegação antes da limpeza e os resolve', () => {
    const page = extractPage(html, 'https://orbitjobs.com')
    expect(page.links).toContain('https://orbitjobs.com/pricing')
    expect(page.links).toContain('https://twitter.com/x')
  })
})

describe('estimateCostUsd', () => {
  it('cobra input e output pelo preço do tier', () => {
    // Opus 5: US$ 5 / MTok in, US$ 25 / MTok out.
    const cost = estimateCostUsd('strong', { inputTokens: 1_000_000, outputTokens: 1_000_000 })
    expect(cost).toBeCloseTo(30, 6)
  })

  it('aplica os multiplicadores de cache', () => {
    const cost = estimateCostUsd('cheap', {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 1_000_000, // 1 * 0,1
      cacheWriteTokens: 1_000_000, // 1 * 1,25
    })
    expect(cost).toBeCloseTo(1.35, 6)
  })

  it('chamada sem tokens custa zero', () => {
    expect(estimateCostUsd('standard', { inputTokens: 0, outputTokens: 0 })).toBe(0)
  })
})

describe('idempotencyKeyFor', () => {
  it('mesma hora e mesmo produto geram a mesma chave', () => {
    const at = new Date('2026-08-16T14:32:00Z')
    const later = new Date('2026-08-16T14:59:59Z')
    expect(idempotencyKeyFor({ productId: 'p1' }, at)).toBe(
      idempotencyKeyFor({ productId: 'p1' }, later),
    )
  })

  it('horas diferentes geram chaves diferentes', () => {
    expect(idempotencyKeyFor({ productId: 'p1' }, new Date('2026-08-16T14:00:00Z'))).not.toBe(
      idempotencyKeyFor({ productId: 'p1' }, new Date('2026-08-16T15:00:00Z')),
    )
  })

  it('produtos diferentes nunca colidem', () => {
    const at = new Date('2026-08-16T14:00:00Z')
    expect(idempotencyKeyFor({ productId: 'p1' }, at)).not.toBe(
      idempotencyKeyFor({ productId: 'p2' }, at),
    )
  })

  it('force sempre gera chave nova — a intenção é refazer', () => {
    const at = new Date('2026-08-16T14:00:00Z')
    const a = idempotencyKeyFor({ productId: 'p1', force: true }, at)
    const b = idempotencyKeyFor({ productId: 'p1', force: true }, new Date(at.getTime() + 1))
    expect(a).not.toBe(b)
  })
})
