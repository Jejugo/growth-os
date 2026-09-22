import { describe, expect, it, beforeAll, beforeEach, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'

const hasDb = Boolean(process.env.TEST_DATABASE_URL)
if (hasDb) process.env.USE_TEST_POSTGRES = 'true'

describe.skipIf(!hasDb)('publicação manual (integração)', () => {
  let db: typeof import('@/lib/db').db
  let schema: typeof import('@/lib/db/schema')
  let distribution: typeof import('@/modules/distribution')
  let manual: typeof import('@/modules/distribution/manual')
  let reconcileOne: typeof import('@/trigger/reconcile-publications').reconcileOne

  beforeAll(async () => {
    ;({ db } = await import('@/lib/db'))
    schema = await import('@/lib/db/schema')
    distribution = await import('@/modules/distribution')
    manual = await import('@/modules/distribution/manual')
    ;({ reconcileOne } = await import('@/trigger/reconcile-publications'))
  })

  beforeEach(async () => {
    await db.delete(schema.decisions)
    await db.delete(schema.products)
  })

  afterAll(async () => {
    await db.delete(schema.decisions)
    await db.delete(schema.products)
  })

  async function seed(channel: 'linkedin' | 'bluesky' = 'linkedin') {
    const productId = randomUUID()
    const campaignId = randomUUID()
    const themeId = randomUUID()
    const ideaId = randomUUID()
    const postId = randomUUID()
    const accountId = randomUUID()

    await db.insert(schema.products).values({
      id: productId,
      name: 'Produto manual test',
      url: 'https://manual-test.example.com',
      domain: `manual-test-${productId}.example.com`,
      stage: 'validating',
    })
    await db.insert(schema.campaigns).values({
      id: campaignId,
      productId,
      name: 'Campanha teste',
      bigIdea: 'Ideia teste',
      hypothesis: 'Hipótese teste',
    })
    await db.insert(schema.contentThemes).values({
      id: themeId,
      productId,
      campaignId,
      name: 'Tema teste',
      description: 'Tema teste',
    })
    await db.insert(schema.contentIdeas).values({
      id: ideaId,
      productId,
      campaignId,
      themeId,
      title: 'Ideia teste',
      summary: 'Resumo teste',
      angle: 'solution',
    })
    await db.insert(schema.socialPosts).values({
      id: postId,
      productId,
      ideaId,
      campaignId,
      channel,
      hook: 'Hook teste',
      body: 'Corpo teste',
      status: 'scheduled',
    })
    await db.insert(schema.channelAccounts).values({
      id: accountId,
      productId,
      channel,
      handle: 'Página teste',
      displayName: 'Página teste',
      credentials: channel === 'linkedin' ? null : 'encrypted',
      pageUrl: 'https://www.linkedin.com/company/teste',
    })
    await db.insert(schema.automationPolicies).values({ productId, channel })
    return { productId, postId, accountId, ideaId, campaignId }
  }

  async function insertPublication(input: {
    productId: string
    postId: string
    accountId: string
    status: 'awaiting_manual' | 'published' | 'unknown'
    createdAt?: Date
    scheduledFor?: Date
    publishedAt?: Date | null
  }) {
    const id = randomUUID()
    const scheduledFor = input.scheduledFor ?? new Date()
    await db.insert(schema.publications).values({
      id,
      productId: input.productId,
      postId: input.postId,
      channelAccountId: input.accountId,
      idempotencyKey: randomUUID(),
      status: input.status,
      scheduledFor,
      createdAt: input.createdAt,
      publishedAt: input.publishedAt,
    })
    return id
  }

  it('confirma e descarta com transição condicional e idempotência', async () => {
    const base = await seed()
    const publicationId = await insertPublication({ ...base, status: 'awaiting_manual' })

    const first = await manual.confirmManualPublication(publicationId, 'https://linkedin.com/posts/1')
    const second = await manual.confirmManualPublication(publicationId, 'https://linkedin.com/posts/2')
    expect(first.idempotent).toBe(false)
    expect(second.idempotent).toBe(true)

    const confirmed = await distribution.findPublication(publicationId)
    expect(confirmed?.status).toBe('published')
    expect(confirmed?.publishedAt).toBeInstanceOf(Date)
    expect(confirmed?.manualConfirmedAt).toBeInstanceOf(Date)
    expect(confirmed?.externalUrl).toBe('https://linkedin.com/posts/1')

    const discardedPost = randomUUID()
    await db.insert(schema.socialPosts).values({
      id: discardedPost,
      productId: base.productId,
      ideaId: base.ideaId,
      campaignId: base.campaignId,
      channel: 'linkedin',
      hook: 'Hook descarte',
      body: 'Corpo descarte',
      status: 'scheduled',
    })
    const discardId = await insertPublication({ ...base, postId: discardedPost, status: 'awaiting_manual' })
    const discardFirst = await manual.discardManualPublication(discardId)
    const discardSecond = await manual.discardManualPublication(discardId)
    expect(discardFirst.idempotent).toBe(false)
    expect(discardSecond.idempotent).toBe(true)
    expect((await distribution.findPublication(discardId))?.status).toBe('cancelled')
  })

  it('conta limite por publishedAt, ignorando scheduledFor e pendentes', async () => {
    const base = await seed('bluesky')
    const old = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
    const recent = new Date(Date.now() - 60 * 60 * 1000)
    await insertPublication({ ...base, status: 'published', scheduledFor: recent, publishedAt: old })
    await insertPublication({ ...base, status: 'published', scheduledFor: old, publishedAt: recent })
    await insertPublication({ ...base, status: 'awaiting_manual', scheduledFor: recent })
    expect(await distribution.countPublishedInWindow(base.accountId, new Date(Date.now() - 3 * 60 * 60 * 1000))).toBe(1)
  })

  it('reconciliador ignora publicação manual', async () => {
    const base = await seed()
    const publicationId = await insertPublication({ ...base, status: 'unknown' })
    expect(await reconcileOne(publicationId)).toBe('pending')
    expect((await distribution.findPublication(publicationId))?.status).toBe('unknown')
  })
})
