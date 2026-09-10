import { and, desc, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { campaigns, contentThemes } from './schema'
import type { Campaign, ContentTheme } from './schema'
import type { PlannedTheme } from './types'

// --- Campanhas -----------------------------------------------------------

export async function insertCampaign(row: {
  productId: string
  missionId?: string | null
  name: string
  bigIdea: string
  hypothesis: string
  audienceSegmentIds: string[]
}): Promise<Campaign> {
  const [created] = await db.insert(campaigns).values(row).returning()
  return created!
}

export async function findActiveCampaign(productId: string): Promise<Campaign | undefined> {
  const [found] = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.productId, productId), eq(campaigns.status, 'active')))
    .orderBy(desc(campaigns.createdAt))
    .limit(1)
  return found
}

export async function listCampaigns(productId: string): Promise<Campaign[]> {
  return db
    .select()
    .from(campaigns)
    .where(eq(campaigns.productId, productId))
    .orderBy(desc(campaigns.createdAt))
}

export async function findCampaign(id: string): Promise<Campaign | undefined> {
  const [found] = await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1)
  return found
}

export async function activateCampaign(id: string): Promise<void> {
  await db
    .update(campaigns)
    .set({ status: 'active', updatedAt: sql`now()` })
    .where(eq(campaigns.id, id))
}

export async function listPastCampaigns(productId: string, limit = 5): Promise<Campaign[]> {
  return db
    .select()
    .from(campaigns)
    .where(eq(campaigns.productId, productId))
    .orderBy(desc(campaigns.createdAt))
    .limit(limit)
}

export async function hasAnyCampaign(productId: string): Promise<boolean> {
  const rows = await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(eq(campaigns.productId, productId))
    .limit(1)
  return rows.length > 0
}

// --- Temas de conteúdo --------------------------------------------------

export async function insertThemes(
  productId: string,
  campaignId: string,
  themes: PlannedTheme[],
): Promise<ContentTheme[]> {
  return db
    .insert(contentThemes)
    .values(
      themes.map((t) => ({
        productId,
        campaignId,
        name: t.name,
        description: t.description,
        keywords: t.keywords,
      })),
    )
    .returning()
}

export async function listThemes(campaignId: string): Promise<ContentTheme[]> {
  return db
    .select()
    .from(contentThemes)
    .where(and(eq(contentThemes.campaignId, campaignId), eq(contentThemes.status, 'active')))
    .orderBy(desc(contentThemes.createdAt))
}
