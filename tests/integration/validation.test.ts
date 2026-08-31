import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'

/**
 * Integração contra um Postgres real — mesmo padrão de
 * tests/integration/analyze-product.test.ts. Sobe o banco com `pnpm db:up &&
 * pnpm db:migrate` antes de rodar.
 */
const hasDb = Boolean(process.env.DATABASE_URL)

describe.skipIf(!hasDb)('fluxo de validação de ideia (integração)', () => {
  let db: typeof import('@/lib/db').db
  let schema: typeof import('@/lib/db/schema')
  let validation: typeof import('@/modules/validation')
  let products: typeof import('@/modules/products')
  let setAiProvider: typeof import('@/modules/ai').__setAiProvider
  let insertGrowthEvent: typeof import('@/modules/attribution/repo').insertGrowthEvent

  beforeAll(async () => {
    ;({ db } = await import('@/lib/db'))
    schema = await import('@/lib/db/schema')
    validation = await import('@/modules/validation')
    products = await import('@/modules/products')
    ;({ __setAiProvider: setAiProvider } = await import('@/modules/ai'))
    ;({ insertGrowthEvent } = await import('@/modules/attribution/repo'))

    setAiProvider({
      async generateStructured({ task }) {
        const data = fakeAiOutput(task)
        return {
          data: data as never,
          usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheWriteTokens: 0 },
          costUsd: 0.001,
          model: 'fake',
          latencyMs: 1,
          callId: `fake-${task}-${randomUUID()}`,
        }
      },
      async generateText() {
        throw new Error('não usado')
      },
    })
  })

  beforeEach(async () => {
    await db.delete(schema.decisions)
    await db.delete(schema.jobRuns)
    await db.delete(schema.aiCalls)
    await db.delete(schema.products) // cascata cobre briefs, validações, campanhas, experimentos, eventos
  })

  afterAll(async () => {
    setAiProvider(undefined)
    await db.delete(schema.decisions)
    await db.delete(schema.jobRuns)
    await db.delete(schema.aiCalls)
    await db.delete(schema.products)
  })

  const BRIEF = {
    problem: 'Freelancers perdem horas montando propostas comerciais do zero.',
    audience: 'Freelancers de design e desenvolvimento com 2+ anos de experiência.',
    solutionSketch: 'Gerador de propostas com IA a partir de um brief curto do cliente.',
    whyNow: null,
    alternatives: 'Word/Google Docs e templates soltos.',
    riskiestAssumption: 'Freelancers pagariam por gerar propostas mais rápido.',
  }

  it('cadastra uma ideia com perfil derivado do brief, sem crawl', async () => {
    const { product, brief } = await validation.createIdeaProduct({
      name: 'PropostaFlow',
      brief: BRIEF,
    })

    expect(product.stage).toBe('idea')
    expect(product.url).toBeNull()
    expect(product.domain).toBeNull()
    expect(brief.riskiestAssumption).toBe(BRIEF.riskiestAssumption)

    const profile = await products.getCurrentProfile(product.id)
    expect(profile?.source).toBe('human')
    expect(profile?.productName).toBe('PropostaFlow (fake)')
  })

  it('inicia validação: transiciona para validating, trava limiares e cria campanha/experimento', async () => {
    const { product } = await validation.createIdeaProduct({ name: 'PropostaFlow', brief: BRIEF })

    const run = await validation.startValidation({
      productId: product.id,
      landingUrl: 'https://propostaflow-teste.com',
      windowDays: 7,
      minVisitors: 10,
      minSignups: 5,
      minSignupRate: 0.1,
      minStrongSignals: 2,
    })

    expect(run.status).toBe('running')
    expect(run.minVisitors).toBe(10)
    expect(run.campaignId).toBeTruthy()
    expect(run.contentThemeId).toBeTruthy()
    expect(run.experimentId).toBeTruthy()

    const updated = await products.findProduct(product.id)
    expect(updated?.stage).toBe('validating')
    expect(updated?.domain).toBe('propostaflow-teste.com')

    const events = await validation.listStageEvents(product.id)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ fromStage: 'idea', toStage: 'validating', actor: 'human' })

    // Não é possível iniciar uma segunda validação enquanto uma está rodando.
    await expect(
      validation.startValidation({ productId: product.id, landingUrl: 'https://outra.com' }),
    ).rejects.toThrow(/já existe uma validação em andamento/i)
  })

  it('conclui com veredito build e promove o produto para building', async () => {
    const { product } = await validation.createIdeaProduct({ name: 'PropostaFlow', brief: BRIEF })
    const run = await validation.startValidation({
      productId: product.id,
      landingUrl: 'https://propostaflow-teste.com',
      windowDays: 7,
      minVisitors: 10,
      minSignups: 5,
      minSignupRate: 0.1,
      minStrongSignals: 2,
    })

    // 20 visitantes, 6 inscrições (taxa 30% > 10%), 2 sinais fortes → BUILD.
    for (let i = 0; i < 20; i++) {
      await insertGrowthEvent({
        productId: product.id,
        visitorId: `visitor-${i}`,
        externalUserId: null,
        eventType: 'impression',
        campaignId: null,
        postId: null,
        publicationId: null,
        trackingLinkId: null,
        audienceSegmentId: null,
        channel: 'bluesky',
        value: null,
        attributionModel: 'none',
        metadata: {},
        occurredAt: new Date(),
        dedupeKey: `impression-${i}`,
      })
    }
    for (let i = 0; i < 6; i++) {
      await insertGrowthEvent({
        productId: product.id,
        visitorId: `visitor-${i}`,
        externalUserId: null,
        eventType: 'signup',
        campaignId: null,
        postId: null,
        publicationId: null,
        trackingLinkId: null,
        audienceSegmentId: null,
        channel: 'bluesky',
        value: null,
        attributionModel: 'none',
        metadata: {},
        occurredAt: new Date(),
        dedupeKey: `signup-${i}`,
      })
    }
    await validation.recordManualSignal({ productId: product.id, kind: 'activation', note: 'call 1' })
    await validation.recordManualSignal({ productId: product.id, kind: 'paid', note: 'depósito' })

    const result = await validation.concludeValidationById(run.id)
    expect(result?.verdict).toBe('build')

    const concluded = await validation.findValidation(run.id)
    expect(concluded?.status).toBe('concluded')
    expect(concluded?.verdictReason).toContain('fake verdict reason')

    const updated = await products.findProduct(product.id)
    expect(updated?.stage).toBe('building')

    // Idempotência: concluir de novo não faz nada (já não está 'running').
    const second = await validation.concludeValidationById(run.id)
    expect(second).toBeNull()
  })

  it('tráfego insuficiente é sempre inconclusive, nunca kill, e não muda o estágio', async () => {
    const { product } = await validation.createIdeaProduct({ name: 'PropostaFlow', brief: BRIEF })
    const run = await validation.startValidation({
      productId: product.id,
      landingUrl: 'https://propostaflow-teste.com',
      minVisitors: 300,
      minSignups: 100,
    })

    // Nenhum growth_event registrado — 0 visitantes, bem abaixo do mínimo.
    const result = await validation.concludeValidationById(run.id)
    expect(result?.verdict).toBe('inconclusive')

    const updated = await products.findProduct(product.id)
    expect(updated?.stage).toBe('validating')
  })
})

function fakeAiOutput(task: string): unknown {
  switch (task) {
    case 'validation.positioning-from-brief':
      return {
        productName: 'PropostaFlow (fake)',
        oneLiner: 'Propostas comerciais em minutos, não horas.',
        primaryProblem: 'Freelancers perdem horas montando propostas do zero para cada cliente novo.',
        valueProposition: 'Gera uma proposta pronta a partir de um brief curto.',
        pricingSummary: null,
        targetUsers: ['freelancer de design com 2+ anos de experiência'],
        industries: ['design', 'desenvolvimento'],
        useCases: ['resposta rápida a briefing de cliente'],
        differentiators: ['geração a partir de brief curto'],
        competitors: [],
        keywords: ['proposta comercial'],
        objections: ['confiança em conteúdo gerado por IA'],
        contentThemes: ['produtividade para freelancers'],
      }
    case 'validation.derive-angles':
      return {
        variants: [
          {
            name: 'Tempo economizado',
            description: 'Foca em quantas horas por semana o freelancer recupera.',
            positioningAngle: 'Enfatize o tempo economizado por proposta.',
          },
          {
            name: 'Taxa de fechamento',
            description: 'Foca em propostas mais profissionais fechando mais contratos.',
            positioningAngle: 'Enfatize a taxa de conversão de propostas.',
          },
        ],
      }
    case 'validation.write-post':
      return {
        hook: `Você perde horas escrevendo a mesma proposta? ${randomUUID().slice(0, 8)}`,
        body: 'PropostaFlow gera sua proposta a partir de um brief curto.',
        cta: 'Entre na lista de espera',
        ctaType: 'direct',
      }
    case 'content.review-risk':
      return { verdict: 'pass', reasons: [], suggestedFix: null }
    case 'validation.write-verdict':
      return {
        verdictReason: 'fake verdict reason — números batem com o limiar configurado no teste.',
        pivotSuggestions: [],
      }
    default:
      throw new Error(`task de IA não mapeada no fake: ${task}`)
  }
}
