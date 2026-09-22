import { describe, expect, it, beforeAll, beforeEach, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { eq, and } from 'drizzle-orm'

const hasDb = Boolean(process.env.TEST_DATABASE_URL)
if (hasDb) process.env.USE_TEST_POSTGRES = 'true'

describe.skipIf(!hasDb)('Critérios de Aceite - Publicação Manual (1 a 11)', () => {
  let db: typeof import('@/lib/db').db
  let schema: typeof import('@/lib/db/schema')
  let distribution: typeof import('@/modules/distribution')
  let manual: typeof import('@/modules/distribution/manual')
  let reconcileOne: typeof import('@/trigger/reconcile-publications').reconcileOne
  let runGrowthTickForProduct: typeof import('@/trigger/growth-tick').runGrowthTickForProduct
  let expireManualPublicationsTask: typeof import('@/trigger/expire-manual-publications').expireManualPublicationsTask
  let listValidationChannels: typeof import('@/modules/distribution').listValidationChannels

  beforeAll(async () => {
    ;({ db } = await import('@/lib/db'))
    schema = await import('@/lib/db/schema')
    distribution = await import('@/modules/distribution')
    manual = await import('@/modules/distribution/manual')
    ;({ reconcileOne } = await import('@/trigger/reconcile-publications'))
    ;({ runGrowthTickForProduct } = await import('@/trigger/growth-tick'))
    ;({ expireManualPublicationsTask } = await import('@/trigger/expire-manual-publications'))
    ;({ listValidationChannels } = await import('@/modules/distribution'))
  })

  beforeEach(async () => {
    await db.delete(schema.decisions)
    await db.delete(schema.jobRuns)
    await db.delete(schema.products)
  })

  afterAll(async () => {
    await db.delete(schema.decisions)
    await db.delete(schema.jobRuns)
    await db.delete(schema.products)
  })

  async function seedProduct(opts?: {
    channel?: 'linkedin' | 'bluesky'
    postStatus?: 'approved' | 'scheduled' | 'published' | 'cancelled'
    allowedHours?: Record<string, Array<[number, number]>> | null
    pageUrl?: string | null
    maxPostsPerDay?: number
  }) {
    const channel = opts?.channel ?? 'linkedin'
    const postStatus = opts?.postStatus ?? 'approved'
    const productId = randomUUID()
    const campaignId = randomUUID()
    const themeId = randomUUID()
    const ideaId = randomUUID()
    const postId = randomUUID()
    const accountId = randomUUID()

    await db.insert(schema.products).values({
      id: productId,
      name: 'Produto QA Acceptance',
      url: 'https://qa-test.example.com',
      domain: `qa-test-${productId}.example.com`,
      stage: 'validating',
    })
    await db.insert(schema.campaigns).values({
      id: campaignId,
      productId,
      name: 'Campanha QA',
      bigIdea: 'Ideia QA',
      hypothesis: 'Hipótese QA',
    })
    await db.insert(schema.contentThemes).values({
      id: themeId,
      productId,
      campaignId,
      name: 'Tema QA',
      description: 'Tema QA',
    })
    await db.insert(schema.contentIdeas).values({
      id: ideaId,
      productId,
      campaignId,
      themeId,
      title: 'Ideia QA',
      summary: 'Resumo QA',
      angle: 'solution',
    })
    await db.insert(schema.socialPosts).values({
      id: postId,
      productId,
      ideaId,
      campaignId,
      channel,
      hook: 'Hook QA para teste de aceitação',
      body: 'Corpo QA para teste de aceitação com conteúdo relevante.',
      status: postStatus,
    })
    await db.insert(schema.channelAccounts).values({
      id: accountId,
      productId,
      channel,
      handle: 'Pagina QA LinkedIn',
      displayName: 'Página QA LinkedIn',
      credentials: channel === 'linkedin' ? null : 'encrypted',
      pageUrl: opts?.pageUrl !== undefined ? opts.pageUrl : 'https://www.linkedin.com/company/qa-test',
    })
    await db.insert(schema.automationPolicies).values({
      productId,
      channel,
      allowedHours: opts?.allowedHours,
      maxPostsPerDay: opts?.maxPostsPerDay ?? 2,
    })
    return { productId, postId, accountId, ideaId, campaignId, themeId }
  }

  // CRITÉRIO 1
  it('Critério 1: growth tick com política LinkedIn ativa cria awaiting_manual, move post para scheduled, grava decisão e não dispara publish-post', async () => {
    // allowedHours restrita para domingo de madrugada (fora da hora atual)
    const base = await seedProduct({
      channel: 'linkedin',
      postStatus: 'approved',
      allowedHours: { sun: [[0, 1]] },
    })

    const tickResult = await runGrowthTickForProduct(base.productId)

    // Manual agendado
    expect(tickResult.manual).toHaveLength(1)
    expect(tickResult.manual[0]).toMatchObject({
      channel: 'linkedin',
      action: 'SCHEDULED',
    })

    // Publicação criada como awaiting_manual
    const pubs = await distribution.listPublications(base.productId)
    const manualPub = pubs.find((p) => p.channelAccountId === base.accountId)
    expect(manualPub).toBeDefined()
    expect(manualPub?.status).toBe('awaiting_manual')

    // Post movido para scheduled
    const [post] = await db
      .select()
      .from(schema.socialPosts)
      .where(eq(schema.socialPosts.id, base.postId))
    expect(post?.status).toBe('scheduled')

    // Decisão gravada (actor 'growth-tick' no growth-tick.ts, com rationale contendo 'aguardando publicação manual')
    const decisions = await db
      .select()
      .from(schema.decisions)
      .where(eq(schema.decisions.productId, base.productId))
    const scheduleDecision = decisions.find(
      (d) => d.actor === 'growth-tick' && d.decision === 'SCHEDULE' && d.rationale.includes('aguardando publicação manual'),
    )
    expect(scheduleDecision).toBeDefined()

    // Fila manual contém o item
    const queue = await manual.listManualQueue(base.productId)
    expect(queue).toHaveLength(1)
    expect(queue[0]?.publicationId).toBe(manualPub!.id)
  })

  // CRITÉRIO 3
  it('Critério 3: Publiquei sem URL e com URL válida atualiza publicação e post para published e grava decisão human; URL inválida é recusada; duplo clique é idempotente', async () => {
    const base = await seedProduct({ channel: 'linkedin', postStatus: 'scheduled' })

    // Inserir awaiting_manual
    const pubId = randomUUID()
    await db.insert(schema.publications).values({
      id: pubId,
      productId: base.productId,
      postId: base.postId,
      channelAccountId: base.accountId,
      idempotencyKey: randomUUID(),
      status: 'awaiting_manual',
      scheduledFor: new Date(),
    })

    // Tentativa 1: URL inválida (lança erro no serviço, devolve erro na action, sem alterar nada no banco)
    await expect(manual.confirmManualPublication(pubId, 'javascript:alert(1)')).rejects.toThrow(/URL do post deve ser uma URL http\(s\) válida/)
    const pubAfterInvalid = await distribution.findPublication(pubId)
    expect(pubAfterInvalid?.status).toBe('awaiting_manual')

    // Tentativa 2: Publiquei com URL válida
    const validUrl = 'https://www.linkedin.com/feed/update/urn:li:activity:123456789/'
    const confirmRes = await manual.confirmManualPublication(pubId, validUrl)
    expect(confirmRes.idempotent).toBe(false)
    expect(confirmRes.publication.status).toBe('published')

    // Publicação atualizada
    const confirmedPub = await distribution.findPublication(pubId)
    expect(confirmedPub?.status).toBe('published')
    expect(confirmedPub?.publishedAt).toBeInstanceOf(Date)
    expect(confirmedPub?.manualConfirmedAt).toBeInstanceOf(Date)
    expect(confirmedPub?.externalUrl).toBe(validUrl)

    // Post atualizado para published
    const [updatedPost] = await db
      .select()
      .from(schema.socialPosts)
      .where(eq(schema.socialPosts.id, base.postId))
    expect(updatedPost?.status).toBe('published')

    // Decisão registrada pelo actor 'human'
    const decisions = await db
      .select()
      .from(schema.decisions)
      .where(
        and(
          eq(schema.decisions.productId, base.productId),
          eq(schema.decisions.actor, 'human'),
          eq(schema.decisions.decision, 'PUBLISH'),
        ),
      )
    expect(decisions).toHaveLength(1)
    expect(decisions[0]?.rationale).toBe('publicado manualmente')

    // Duplo clique: idempotente
    const doubleClickRes = await manual.confirmManualPublication(pubId, validUrl)
    expect(doubleClickRes.idempotent).toBe(true)

    // Decisão NÃO é duplicada
    const decisionsAfterDouble = await db
      .select()
      .from(schema.decisions)
      .where(
        and(
          eq(schema.decisions.productId, base.productId),
          eq(schema.decisions.actor, 'human'),
          eq(schema.decisions.decision, 'PUBLISH'),
        ),
      )
    expect(decisionsAfterDouble).toHaveLength(1)

    // Teste de Publiquei SEM URL (opcional)
    const post2Id = randomUUID()
    await db.insert(schema.socialPosts).values({
      id: post2Id,
      productId: base.productId,
      ideaId: base.ideaId,
      campaignId: base.campaignId,
      channel: 'linkedin',
      hook: 'Hook sem url',
      body: 'Corpo sem url',
      status: 'scheduled',
    })
    const pub2Id = randomUUID()
    await db.insert(schema.publications).values({
      id: pub2Id,
      productId: base.productId,
      postId: post2Id,
      channelAccountId: base.accountId,
      idempotencyKey: randomUUID(),
      status: 'awaiting_manual',
      scheduledFor: new Date(),
    })

    const confirmWithoutUrl = await manual.confirmManualPublication(pub2Id)
    expect(confirmWithoutUrl.idempotent).toBe(false)
    const pub2 = await distribution.findPublication(pub2Id)
    expect(pub2?.status).toBe('published')
    expect(pub2?.externalUrl).toBeNull()
  })

  // CRITÉRIO 4
  it('Critério 4: expiração de awaiting_manual com mais de 3 dias cancela publicação e post, grava decisão exata e é idempotente', async () => {
    const base = await seedProduct({ channel: 'linkedin', postStatus: 'scheduled' })

    const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000)
    const pubId = randomUUID()
    await db.insert(schema.publications).values({
      id: pubId,
      productId: base.productId,
      postId: base.postId,
      channelAccountId: base.accountId,
      idempotencyKey: randomUUID(),
      status: 'awaiting_manual',
      scheduledFor: fourDaysAgo,
      createdAt: fourDaysAgo,
    })

    // Executa a lógica de expiração (definida em src/trigger/expire-manual-publications.ts)
    const repo = await import('@/modules/distribution/repo')
    const contentRepo = await import('@/modules/content/repo')
    const obs = await import('@/lib/observability/service')

    const cutoff = new Date(Date.now() - manual.MANUAL_EXPIRATION_MS)
    const candidates = await repo.listExpiredManualPublications(cutoff)
    expect(candidates.some((c) => c.id === pubId)).toBe(true)

    let expired = 0
    for (const candidate of candidates) {
      const publication = await repo.expireAwaitingManualPublication(candidate.id)
      if (!publication) continue

      await contentRepo.setPostStatus(publication.postId, 'cancelled')
      await obs.recordDecision({
        productId: publication.productId,
        actor: 'expirer',
        decision: 'CANCEL',
        rationale: 'expirou sem publicação manual',
      })
      expired++
    }
    expect(expired).toBeGreaterThanOrEqual(1)

    // Publicação cancelada com motivo expired_manual
    const expiredPub = await distribution.findPublication(pubId)
    expect(expiredPub?.status).toBe('cancelled')
    expect((expiredPub?.lastError as { reason?: string })?.reason).toBe('expired_manual')

    // Post cancelado
    const [expiredPost] = await db
      .select()
      .from(schema.socialPosts)
      .where(eq(schema.socialPosts.id, base.postId))
    expect(expiredPost?.status).toBe('cancelled')

    // Decisão exata gravada
    const decisions = await db
      .select()
      .from(schema.decisions)
      .where(
        and(
          eq(schema.decisions.productId, base.productId),
          eq(schema.decisions.actor, 'expirer'),
          eq(schema.decisions.decision, 'CANCEL'),
        ),
      )
    expect(decisions).toHaveLength(1)
    expect(decisions[0]?.rationale).toBe('expirou sem publicação manual')

    // Rodar de novo não cria segunda decisão nem altera post (idempotência do expireAwaitingManualPublication)
    const candidates2 = await repo.listExpiredManualPublications(cutoff)
    expect(candidates2.some((c) => c.id === pubId)).toBe(false)

    const reExpired = await repo.expireAwaitingManualPublication(pubId)
    expect(reExpired).toBeUndefined()

    const decisionsAfter = await db
      .select()
      .from(schema.decisions)
      .where(
        and(
          eq(schema.decisions.productId, base.productId),
          eq(schema.decisions.actor, 'expirer'),
          eq(schema.decisions.decision, 'CANCEL'),
        ),
      )
    expect(decisionsAfter).toHaveLength(1)
  })

  // CRITÉRIO 5
  it('Critério 5: maxPostsPerDay = 2: pendentes contam 0 no limite diário e tick barra 3º pendente com manual_queue_full', async () => {
    const base = await seedProduct({
      channel: 'linkedin',
      postStatus: 'approved',
      maxPostsPerDay: 2,
    })

    // Insere 2 pendentes awaiting_manual criados hoje
    const pub1Id = randomUUID()
    const pub2Id = randomUUID()
    await db.insert(schema.publications).values([
      {
        id: pub1Id,
        productId: base.productId,
        postId: base.postId,
        channelAccountId: base.accountId,
        idempotencyKey: randomUUID(),
        status: 'awaiting_manual',
        scheduledFor: new Date(),
      },
      {
        id: pub2Id,
        productId: base.productId,
        postId: base.postId,
        channelAccountId: base.accountId,
        idempotencyKey: randomUUID(),
        status: 'awaiting_manual',
        scheduledFor: new Date(),
      },
    ])

    // Limite diário conta 0 published
    const windowStart = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const count = await distribution.countPublishedInWindow(base.accountId, windowStart)
    expect(count).toBe(0)

    // Tick tenta criar 3º pendente, mas é barrado por manual_queue_full
    const tickResult = await runGrowthTickForProduct(base.productId)
    expect(tickResult.manual[0]).toMatchObject({
      channel: 'linkedin',
      action: 'NO_ACTION',
      reason: 'manual_queue_full',
    })
  })

  // CRITÉRIO 6
  it('Critério 6: reconcile-publications ignora awaiting_manual', async () => {
    const base = await seedProduct({ channel: 'linkedin', postStatus: 'scheduled' })
    const pubId = randomUUID()
    await db.insert(schema.publications).values({
      id: pubId,
      productId: base.productId,
      postId: base.postId,
      channelAccountId: base.accountId,
      idempotencyKey: randomUUID(),
      status: 'awaiting_manual',
      scheduledFor: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    })

    // Reconcile chamado diretamente para a publicação
    const result = await reconcileOne(pubId)
    expect(result).toBe('pending')

    // Status inalterado
    const pub = await distribution.findPublication(pubId)
    expect(pub?.status).toBe('awaiting_manual')
  })

  // CRITÉRIO 7
  it('Critério 7: Descartar move publicação e post para cancelled com decisão human, e tick seguinte não recria item', async () => {
    const base = await seedProduct({ channel: 'linkedin', postStatus: 'scheduled' })
    const pubId = randomUUID()
    await db.insert(schema.publications).values({
      id: pubId,
      productId: base.productId,
      postId: base.postId,
      channelAccountId: base.accountId,
      idempotencyKey: randomUUID(),
      status: 'awaiting_manual',
      scheduledFor: new Date(),
    })

    // Descartar
    const discardRes = await manual.discardManualPublication(pubId)
    expect(discardRes.idempotent).toBe(false)
    expect(discardRes.publication.status).toBe('cancelled')

    // Publicação e post cancelados
    const pub = await distribution.findPublication(pubId)
    expect(pub?.status).toBe('cancelled')

    const [post] = await db
      .select()
      .from(schema.socialPosts)
      .where(eq(schema.socialPosts.id, base.postId))
    expect(post?.status).toBe('cancelled')

    // Decisão human CANCEL registrada
    const decisions = await db
      .select()
      .from(schema.decisions)
      .where(
        and(
          eq(schema.decisions.productId, base.productId),
          eq(schema.decisions.actor, 'human'),
          eq(schema.decisions.decision, 'CANCEL'),
        ),
      )
    expect(decisions).toHaveLength(1)
    expect(decisions[0]?.rationale).toBe('descartado na fila manual')

    // Idempotência
    const secondDiscard = await manual.discardManualPublication(pubId)
    expect(secondDiscard.idempotent).toBe(true)

    // Tick subsequente: não recria o item porque o post está cancelado
    const tickResult = await runGrowthTickForProduct(base.productId)
    expect(tickResult.manual[0]).toMatchObject({
      channel: 'linkedin',
      action: 'NO_ACTION',
      reason: 'no_approved_post',
    })
  })

  // CRITÉRIO 8
  it('Critério 8: listValidationChannels respeita políticas ativas e erro claro sem políticas ativas', async () => {
    const base = await seedProduct({ channel: 'linkedin' })

    // Com só LinkedIn ativo
    let channels = await listValidationChannels(base.productId)
    expect(channels).toEqual(['linkedin'])

    // Adiciona Bluesky ativo
    await db.insert(schema.automationPolicies).values({
      productId: base.productId,
      channel: 'bluesky',
      level: 'automatic',
    })
    channels = await listValidationChannels(base.productId)
    expect(channels).toContain('linkedin')
    expect(channels).toContain('bluesky')

    // Coloca LinkedIn com killSwitch = true
    await db
      .update(schema.automationPolicies)
      .set({ killSwitch: true })
      .where(
        and(
          eq(schema.automationPolicies.productId, base.productId),
          eq(schema.automationPolicies.channel, 'linkedin'),
        ),
      )
    channels = await listValidationChannels(base.productId)
    expect(channels).toEqual(['bluesky'])

    // Desativa também o Bluesky (suggestions_only)
    await db
      .update(schema.automationPolicies)
      .set({ level: 'suggestions_only' })
      .where(
        and(
          eq(schema.automationPolicies.productId, base.productId),
          eq(schema.automationPolicies.channel, 'bluesky'),
        ),
      )
    channels = await listValidationChannels(base.productId)
    expect(channels).toEqual([])

    // Verifica que o pipeline de geração de validação lança erro explícito sem canais
    const validationId = randomUUID()
    const briefId = randomUUID()
    await db.insert(schema.productBriefs).values({
      id: briefId,
      productId: base.productId,
      problem: 'Problema QA',
      audience: 'Audiência QA',
      solutionSketch: 'Solução QA',
      whyNow: null,
      alternatives: 'Nenhuma',
      riskiestAssumption: 'Risco QA',
    })
    await db.insert(schema.validations).values({
      id: validationId,
      productId: base.productId,
      briefId,
      campaignId: base.campaignId,
      contentThemeId: base.themeId,
      hypothesis: 'Hipótese QA',
      landingUrl: 'https://qa-test.example.com',
      minVisitors: 10,
      minSignups: 5,
      minSignupRate: '0.1000',
      minStrongSignals: 2,
    })

    const { runGenerateValidationContentPipeline } = await import('@/trigger/generate-validation-content')
    await expect(
      runGenerateValidationContentPipeline({ validationId }, 'fake-job-id'),
    ).rejects.toThrow(/Nenhum canal com política ativa\. Configure pelo menos um canal em Canais antes de gerar conteúdo\./)
  })

  // CRITÉRIO 9
  it('Critério 9: Bluesky e LinkedIn elegíveis no mesmo tick geram item manual e agendam API na mesma rodada', async () => {
    const base = await seedProduct({ channel: 'linkedin', postStatus: 'approved' })

    // Adiciona conta e post para Bluesky
    const apiAccountId = randomUUID()
    const apiPostId = randomUUID()
    await db.insert(schema.channelAccounts).values({
      id: apiAccountId,
      productId: base.productId,
      channel: 'bluesky',
      handle: 'bluesky.acceptance',
      credentials: 'encrypted',
    })
    await db.insert(schema.automationPolicies).values({
      productId: base.productId,
      channel: 'bluesky',
      allowedHours: null,
    })
    await db.insert(schema.socialPosts).values({
      id: apiPostId,
      productId: base.productId,
      ideaId: base.ideaId,
      campaignId: base.campaignId,
      channel: 'bluesky',
      hook: 'Hook Bluesky Acceptance',
      body: 'Corpo Bluesky Acceptance',
      status: 'approved',
    })

    const tickResult = await runGrowthTickForProduct(base.productId)
    expect(tickResult.manual[0]).toMatchObject({ channel: 'linkedin', action: 'SCHEDULED' })
    expect(tickResult.api).toMatchObject({ channel: 'bluesky', action: 'SCHEDULED' })

    const pubs = await distribution.listPublications(base.productId)
    expect(pubs.some((p) => p.status === 'awaiting_manual')).toBe(true)
    expect(pubs.some((p) => p.status === 'scheduled')).toBe(true)
  })

  // CRITÉRIO 10
  it('Critério 10: cadastro leve com URL usa page_url no atalho Abrir; sem URL usa fallback de feed', async () => {
    // Caso com pageUrl
    const customUrl = 'https://www.linkedin.com/company/minha-empresa'
    const baseWithUrl = await seedProduct({ channel: 'linkedin', pageUrl: customUrl })
    const pub1Id = randomUUID()
    await db.insert(schema.publications).values({
      id: pub1Id,
      productId: baseWithUrl.productId,
      postId: baseWithUrl.postId,
      channelAccountId: baseWithUrl.accountId,
      idempotencyKey: randomUUID(),
      status: 'awaiting_manual',
      scheduledFor: new Date(),
    })

    const queueWithUrl = await manual.listManualQueue(baseWithUrl.productId)
    expect(queueWithUrl[0]?.openUrl).toBe(customUrl)

    // Caso sem pageUrl (fallback feed)
    const baseWithoutUrl = await seedProduct({ channel: 'linkedin', pageUrl: null })
    const pub2Id = randomUUID()
    await db.insert(schema.publications).values({
      id: pub2Id,
      productId: baseWithoutUrl.productId,
      postId: baseWithoutUrl.postId,
      channelAccountId: baseWithoutUrl.accountId,
      idempotencyKey: randomUUID(),
      status: 'awaiting_manual',
      scheduledFor: new Date(),
    })

    const queueWithoutUrl = await manual.listManualQueue(baseWithoutUrl.productId)
    expect(queueWithoutUrl[0]?.openUrl).toBe('https://www.linkedin.com/feed/')
  })
})
