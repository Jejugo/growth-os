import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest'

/**
 * Integração contra um Postgres real. Sobe um com:
 *   docker run -d --name growthos-pg -e POSTGRES_PASSWORD=postgres \
 *     -e POSTGRES_DB=growthos -p 55432:5432 postgres:16-alpine
 *   pnpm db:migrate
 *
 * A guarda de SSRF é substituída porque o site de teste não existe no DNS —
 * ela tem cobertura própria em tests/url.test.ts.
 */
vi.mock('@/modules/products/url', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/products/url')>()),
  assertPublicHost: vi.fn(async () => {}),
}))

const hasDb = Boolean(process.env.DATABASE_URL)

const HOME_HTML = `<html><head><title>Orbit Jobs</title>
<meta name="description" content="Vagas remotas que realmente contratam na América Latina." /></head>
<body><nav><a href="/pricing">Preços</a></nav>
<main><h1>Vagas remotas de verdade</h1><p>Filtramos por elegibilidade de contratação.</p></main>
</body></html>`

const PRICING_HTML = `<html><head><title>Preços</title></head>
<body><main><h1>Planos</h1><p>Grátis para candidatos.</p></main></body></html>`

let aiCallCount = 0

function installFetchStub(homeHtml: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      const html = (body: string) =>
        new Response(body, { status: 200, headers: { 'content-type': 'text/html' } })

      if (url.endsWith('/robots.txt')) return new Response('', { status: 404 })
      if (url.endsWith('/sitemap.xml')) return new Response('', { status: 404 })
      if (url.endsWith('/pricing')) return html(PRICING_HTML)
      return html(homeHtml)
    }),
  )
}

describe.skipIf(!hasDb)('analyzeProduct (integração)', () => {
  let db: typeof import('@/lib/db').db
  let schema: typeof import('@/lib/db/schema')
  let products: typeof import('@/modules/products')
  let setAiProvider: typeof import('@/modules/ai').__setAiProvider
  let claimJobRun: typeof import('@/lib/observability/service').claimJobRun
  let finishJobRun: typeof import('@/lib/observability/service').finishJobRun

  beforeAll(async () => {
    ;({ db } = await import('@/lib/db'))
    schema = await import('@/lib/db/schema')
    products = await import('@/modules/products')
    ;({ __setAiProvider: setAiProvider } = await import('@/modules/ai'))
    ;({ claimJobRun, finishJobRun } = await import('@/lib/observability/service'))

    // Provider falso: conta chamadas e devolve saída válida e determinística.
    setAiProvider({
      async generateStructured({ task }) {
        aiCallCount += 1
        const data =
          task === 'product.analyze.extract'
            ? {
                productName: 'Orbit Jobs',
                tagline: 'Vagas remotas de verdade',
                pricingSummary: 'Grátis para candidatos',
                pricingTiers: [{ name: 'Free', price: 'R$ 0', notes: null }],
                ctas: ['Criar conta'],
                featuresListed: ['Filtro por elegibilidade'],
                integrationsMentioned: [],
                socialProof: [],
              }
            : {
                oneLiner: 'Encontra vagas remotas que contratam na América Latina.',
                primaryProblem:
                  'Desenvolvedores da América Latina perdem tempo com vagas remotas que não podem contratá-los.',
                valueProposition: 'Só mostra vagas com elegibilidade confirmada.',
                targetUsers: ['engenheiro backend sênior no Brasil'],
                industries: ['tecnologia'],
                useCases: ['busca de emprego remoto'],
                differentiators: ['dados de elegibilidade de contratação'],
                competitors: [],
                keywords: ['vaga remota'],
                objections: ['poucas vagas listadas'],
                contentThemes: ['restrições geográficas de contratação'],
                confidence: {
                  primaryProblem: 0.9,
                  targetUsers: 0.8,
                  valueProposition: 0.85,
                  differentiators: 0.7,
                  competitors: 0.3,
                },
              }
        return {
          data: data as never,
          usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheWriteTokens: 0 },
          costUsd: 0.001,
          model: 'fake',
          latencyMs: 1,
          callId: 'fake-call',
        }
      },
      async generateText() {
        throw new Error('não usado')
      },
    })
  })

  beforeEach(async () => {
    aiCallCount = 0
    installFetchStub(HOME_HTML)
    await db.delete(schema.decisions)
    await db.delete(schema.jobRuns)
    await db.delete(schema.aiCalls)
    await db.delete(schema.products) // cascata cobre perfis e snapshots
  })

  afterAll(() => {
    setAiProvider(undefined)
    vi.unstubAllGlobals()
  })

  it('cria produto, lê o site e produz um perfil v1', async () => {
    const product = await products.registerProduct('https://orbit-teste.com')
    const outcome = await products.analyzeProduct({ productId: product.id })

    expect(outcome.status).toBe('analyzed')
    expect(outcome.version).toBe(1)
    expect(outcome.pagesRead).toBe(2) // home + pricing

    const profile = await products.getCurrentProfile(product.id)
    expect(profile?.source).toBe('ai')
    expect(profile?.productName).toBe('Orbit Jobs')
    expect(profile?.primaryProblem).toContain('América Latina')
    expect(profile?.data.targetUsers).toEqual(['engenheiro backend sênior no Brasil'])
  })

  it('reanalisar sem mudança no site não cria versão nem gasta token', async () => {
    const product = await products.registerProduct('https://orbit-teste.com')
    await products.analyzeProduct({ productId: product.id })

    const callsAfterFirst = aiCallCount
    const second = await products.analyzeProduct({ productId: product.id })

    expect(second.status).toBe('unchanged')
    expect(second.costUsd).toBe(0)
    expect(aiCallCount).toBe(callsAfterFirst) // nenhuma chamada nova
    expect(await products.listProfileVersions(product.id)).toHaveLength(1)
  })

  it('site alterado gera versão nova', async () => {
    const product = await products.registerProduct('https://orbit-teste.com')
    await products.analyzeProduct({ productId: product.id })

    installFetchStub(HOME_HTML.replace('Vagas remotas de verdade', 'Contratação sem fronteiras'))
    const second = await products.analyzeProduct({ productId: product.id })

    expect(second.status).toBe('analyzed')
    expect(second.version).toBe(2)
  })

  it('edição humana sobrevive a uma reanálise forçada', async () => {
    const product = await products.registerProduct('https://orbit-teste.com')
    await products.analyzeProduct({ productId: product.id })

    await products.editProfileField({
      productId: product.id,
      field: 'primaryProblem',
      value: 'Texto escrito à mão pelo fundador.',
    })

    const afterEdit = await products.getCurrentProfile(product.id)
    expect(afterEdit?.source).toBe('human')
    expect(afterEdit?.lockedFields).toContain('primaryProblem')

    await products.analyzeProduct({ productId: product.id, force: true })
    const afterReanalysis = await products.getCurrentProfile(product.id)

    expect(afterReanalysis?.source).toBe('merged')
    expect(afterReanalysis?.primaryProblem).toBe('Texto escrito à mão pelo fundador.')
    // Os demais campos foram atualizados normalmente.
    expect(afterReanalysis?.oneLiner).toContain('Encontra vagas remotas')
    expect(afterReanalysis?.version).toBe(3)
  })

  it('destravar devolve o campo ao controle da IA', async () => {
    const product = await products.registerProduct('https://orbit-teste.com')
    await products.analyzeProduct({ productId: product.id })
    await products.editProfileField({
      productId: product.id,
      field: 'oneLiner',
      value: 'Minha versão.',
    })
    await products.unlockProfileField({ productId: product.id, field: 'oneLiner' })
    await products.analyzeProduct({ productId: product.id, force: true })

    const profile = await products.getCurrentProfile(product.id)
    expect(profile?.lockedFields).not.toContain('oneLiner')
    expect(profile?.oneLiner).toContain('Encontra vagas remotas')
  })

  it('domínio duplicado é rejeitado', async () => {
    await products.registerProduct('https://orbit-teste.com')
    await expect(products.registerProduct('http://www.orbit-teste.com/?x=1')).rejects.toThrow(
      products.ProductAlreadyExistsError,
    )
  })

  it('URL inacessível marca o produto como falho, sem estado pela metade', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })))

    const product = await products.registerProduct('https://quebrado-teste.com')
    await expect(products.analyzeProduct({ productId: product.id })).rejects.toThrow()

    const reloaded = await products.findProduct(product.id)
    expect(reloaded?.analysisStatus).toBe('failed')
    expect(reloaded?.analysisError).toBeTruthy()
    expect(await products.getCurrentProfile(product.id)).toBeUndefined()
  })

  it('dois claims concorrentes da mesma chave: só um executa', async () => {
    const key = `teste-concorrencia:${Date.now()}`
    const [a, b] = await Promise.all([
      claimJobRun({ taskName: 'analyze-product', idempotencyKey: key }),
      claimJobRun({ taskName: 'analyze-product', idempotencyKey: key }),
    ])

    const winners = [a, b].filter((claim) => claim && !claim.resumed)
    expect(winners).toHaveLength(1)
  })

  it('claim de job já concluído é recusado; de job falho é retomado', async () => {
    const key = `teste-retomada:${Date.now()}`

    const first = await claimJobRun({ taskName: 'analyze-product', idempotencyKey: key })
    expect(first).not.toBeNull()

    await finishJobRun(first!.id, 'failed', { error: new Error('boom') })
    const retry = await claimJobRun({ taskName: 'analyze-product', idempotencyKey: key })
    expect(retry?.resumed).toBe(true)

    await finishJobRun(first!.id, 'completed')
    expect(await claimJobRun({ taskName: 'analyze-product', idempotencyKey: key })).toBeNull()
  })

  it('registra decisão explícita quando decide não fazer nada', async () => {
    const product = await products.registerProduct('https://orbit-teste.com')
    await products.analyzeProduct({ productId: product.id })
    await products.analyzeProduct({ productId: product.id })

    const { recentDecisions } = await import('@/lib/observability/repo')
    const decisions = await recentDecisions(product.id)

    expect(decisions.some((d) => d.decision === 'NO_ACTION')).toBe(true)
    expect(decisions.some((d) => d.decision === 'PROFILE_UPDATED')).toBe(true)
  })
})
