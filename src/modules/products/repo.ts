import { and, desc, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { products, productProfiles, productCrawlSnapshots } from './schema'
import type { Product, ProductProfile } from './schema'
import type { CrawledPage } from './crawler'
import type { ProfileData } from './types'

export async function insertProduct(row: {
  name: string
  url: string
  domain: string
}): Promise<Product> {
  const [created] = await db.insert(products).values(row).returning()
  return created!
}

export async function findProductByDomain(domain: string): Promise<Product | undefined> {
  const [found] = await db.select().from(products).where(eq(products.domain, domain)).limit(1)
  return found
}

export async function findProduct(id: string): Promise<Product | undefined> {
  const [found] = await db.select().from(products).where(eq(products.id, id)).limit(1)
  return found
}

export async function listProducts(): Promise<Product[]> {
  return db.select().from(products).orderBy(desc(products.createdAt))
}

export async function setAnalysisStatus(
  productId: string,
  status: 'never' | 'running' | 'ok' | 'failed',
  error?: string | null,
): Promise<void> {
  await db
    .update(products)
    .set({
      analysisStatus: status,
      analysisError: error ?? null,
      lastAnalyzedAt: status === 'ok' ? sql`now()` : undefined,
      updatedAt: sql`now()`,
    })
    .where(eq(products.id, productId))
}

// --- snapshots -----------------------------------------------------------

/**
 * Grava os snapshots do crawl. O unique (produto, url, hash) faz o conflito
 * silencioso: páginas inalteradas não geram linha nova, e a contagem de
 * inseridos diz se houve mudança real desde o último crawl.
 */
export async function saveSnapshots(
  productId: string,
  crawlBatchId: string,
  pages: CrawledPage[],
): Promise<{ insertedCount: number }> {
  if (pages.length === 0) return { insertedCount: 0 }

  const inserted = await db
    .insert(productCrawlSnapshots)
    .values(
      pages.map((p) => ({
        productId,
        crawlBatchId,
        pageUrl: p.pageUrl,
        pageRole: p.pageRole,
        httpStatus: p.httpStatus,
        title: p.title,
        extractedText: p.extractedText,
        contentHash: p.contentHash,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: productCrawlSnapshots.id })

  return { insertedCount: inserted.length }
}

// --- perfis --------------------------------------------------------------

export async function getCurrentProfile(productId: string): Promise<ProductProfile | undefined> {
  const [found] = await db
    .select()
    .from(productProfiles)
    .where(and(eq(productProfiles.productId, productId), eq(productProfiles.isCurrent, true)))
    .limit(1)
  return found
}

export async function listProfileVersions(productId: string): Promise<ProductProfile[]> {
  return db
    .select()
    .from(productProfiles)
    .where(eq(productProfiles.productId, productId))
    .orderBy(desc(productProfiles.version))
}

export interface NewProfileRow {
  productId: string
  source: 'ai' | 'human' | 'merged'
  promptVersion?: string | null
  crawlBatchId?: string | null
  productName: string | null
  oneLiner: string | null
  primaryProblem: string | null
  valueProposition: string | null
  pricingSummary: string | null
  data: ProfileData
  lockedFields: string[]
  confidence?: Record<string, number> | null
  lowConfidence?: boolean
}

/**
 * Cria uma versão nova e a torna corrente, em transação. A versão é calculada
 * dentro da transação para que dois jobs concorrentes não gerem a mesma —
 * o unique (productId, version) transforma o empate em erro, não em silêncio.
 */
export async function insertProfileVersion(row: NewProfileRow): Promise<ProductProfile> {
  return db.transaction(async (tx) => {
    const [last] = await tx
      .select({ version: productProfiles.version })
      .from(productProfiles)
      .where(eq(productProfiles.productId, row.productId))
      .orderBy(desc(productProfiles.version))
      .limit(1)

    const nextVersion = (last?.version ?? 0) + 1

    await tx
      .update(productProfiles)
      .set({ isCurrent: false })
      .where(and(eq(productProfiles.productId, row.productId), eq(productProfiles.isCurrent, true)))

    const [created] = await tx
      .insert(productProfiles)
      .values({ ...row, version: nextVersion, isCurrent: true })
      .returning()

    return created!
  })
}
