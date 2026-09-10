import { listProducts, getCurrentProfile } from '@/modules/products'
import { getSystemConfig, hasAnyChannelAccount } from '@/modules/distribution/repo'
import { findLatestBrief, findLatestLandingPage } from '@/modules/validation'
import { hasAnyCampaign } from '@/modules/campaigns'
import { hasAnyGrowthEvent } from '@/modules/attribution/repo'
import { hasAnyLearningOrRollup } from '@/modules/analytics'
import { hasAnyExperiment } from '@/modules/content'
import type { Product, ProductStage } from '@/modules/products'

/** Dados comuns aos três pontos que renderizam a `Sidebar` (`/`, lista de produtos, `[id]`). */
export async function getSidebarData(): Promise<{
  products: Product[]
  automationActive: boolean
}> {
  const [products, config] = await Promise.all([
    listProducts(),
    getSystemConfig().catch(() => null),
  ])
  return { products, automationActive: !(config?.globalKillSwitch ?? false) }
}

export interface SectionAvailability {
  available: boolean
  reason?: string
}

/**
 * Esmaece seções da sidebar sem precondição/dado ainda — nunca as esconde. Cada seção usa a
 * checagem que faz sentido pra ela (a maioria é "existe algum registro desse tipo?"; Conteúdo usa
 * o mesmo estado que já pausa o `growth-tick`). Seção sem regra aqui fica sempre disponível.
 */
export async function getProductSectionAvailability(
  productId: string,
  stage: ProductStage,
): Promise<Partial<Record<string, SectionAvailability>>> {
  const [brief, profile, landingPage, hasCampaign, hasChannelAccount, hasGrowthEvent, hasLearningOrRollup, hasExperiment] =
    await Promise.all([
      findLatestBrief(productId),
      getCurrentProfile(productId),
      findLatestLandingPage(productId),
      hasAnyCampaign(productId),
      hasAnyChannelAccount(productId),
      hasAnyGrowthEvent(productId),
      hasAnyLearningOrRollup(productId),
      hasAnyExperiment(productId),
    ])

  return {
    validation: brief
      ? { available: true }
      : { available: false, reason: 'Este produto não passou pela validação de ideia' },
    audiences: profile
      ? { available: true }
      : { available: false, reason: 'Precisa de um perfil de produto analisado' },
    landing: landingPage
      ? { available: true }
      : { available: false, reason: 'Nenhuma landing gerada ainda' },
    content:
      stage === 'idea' || stage === 'building'
        ? {
            available: false,
            reason:
              stage === 'building'
                ? 'Geração pausada durante a construção'
                : 'Inicie a validação para gerar conteúdo',
          }
        : { available: true },
    campaigns: hasCampaign
      ? { available: true }
      : { available: false, reason: 'Nenhuma campanha ainda' },
    publications: hasChannelAccount
      ? { available: true }
      : { available: false, reason: 'Conecte um canal primeiro' },
    analytics: hasGrowthEvent
      ? { available: true }
      : { available: false, reason: 'Sem dados de atribuição ainda' },
    insights: hasLearningOrRollup
      ? { available: true }
      : { available: false, reason: 'Sem aprendizados ainda' },
    experiments: hasExperiment
      ? { available: true }
      : { available: false, reason: 'Nenhum experimento criado ainda' },
  }
}
