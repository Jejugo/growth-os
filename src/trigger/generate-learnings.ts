import { task, schedules, logger } from '@trigger.dev/sdk'
import { getAllRollupsForProduct, listActiveLearnings, insertLearning, supersedeLearning } from '@/modules/analytics'
import { summarizePerformance } from '@/modules/analytics/ai/summarize-performance'
import { findProductIdsByStage } from '@/modules/products/repo'
import { recordDecision } from '@/lib/observability/service'

// Máximo de aprendizados ativos por dimensão (evita acumulação sem controle)
const MAX_ACTIVE_LEARNINGS_PER_DIMENSION = 3

export const generateLearningsTask = task({
  id: 'generate-learnings',
  maxDuration: 600,
  run: async (payload: { productId?: string }) => {
    // Só produtos lançados alimentam o aprendizado global (fase 4.5).
    const productIds = payload.productId
      ? [payload.productId]
      : await findProductIdsByStage(['launched'])

    logger.info('Gerando aprendizados', { count: productIds.length })

    let totalGenerated = 0
    let totalCostUsd = 0

    for (const productId of productIds) {
      try {
        const result = await generateLearningsForProduct(productId)
        totalGenerated += result.generated
        totalCostUsd += result.costUsd
      } catch (err) {
        logger.error(`Falha ao gerar aprendizados para ${productId}`, { error: err })
      }
    }

    logger.info('Geração de aprendizados concluída', { totalGenerated, totalCostUsd })
    return { totalGenerated, totalCostUsd }
  },
})

async function generateLearningsForProduct(
  productId: string,
): Promise<{ generated: number; costUsd: number }> {
  // Usa rollups da janela de 28 dias como principal fonte
  const [rollups28d, activeLearnings] = await Promise.all([
    getAllRollupsForProduct(productId, '28d'),
    listActiveLearnings(productId),
  ])

  if (rollups28d.length === 0) {
    logger.info(`Produto ${productId} sem rollups — pulando geração`)
    return { generated: 0, costUsd: 0 }
  }

  const { learnings: generated, callId, costUsd } = await summarizePerformance({
    productId,
    rollups: rollups28d,
    activeLearnings,
  })

  if (generated.length === 0) {
    logger.info(`Nenhum aprendizado gerado para ${productId}`)
    return { generated: 0, costUsd }
  }

  // Para cada aprendizado gerado:
  // 1. Verifica se supera um aprendizado existente na mesma dimensão/valor
  // 2. Insere o novo
  // 3. Supera o anterior se necessário
  let insertedCount = 0

  for (const gen of generated) {
    // Encontra aprendizados ativos na mesma dimensão/valor que podem ser superados
    const sameSlot = activeLearnings.filter(
      (l) => l.dimension === gen.dimension && l.dimensionValue === gen.dimensionValue,
    )

    // Só supera se o novo tiver confiança maior ou o antigo for hypothesis
    const toSupersede = sameSlot.filter(
      (l) => l.kind === 'hypothesis' || Number(l.confidence) < gen.confidence,
    )

    // Insere o novo aprendizado
    const inserted = await insertLearning({
      productId,
      statement: gen.statement,
      kind: gen.kind,
      direction: gen.direction,
      dimension: gen.dimension,
      dimensionValue: gen.dimensionValue,
      evidence: gen.evidence,
      confidence: gen.confidence.toFixed(2),
      status: 'active',
      appliedToPrompt: false,
      aiCallId: callId || null,
      supersededBy: null,
    })

    // Supera os anteriores
    for (const old of toSupersede) {
      await supersedeLearning(old.id, inserted.id)
    }

    insertedCount++
  }

  // Limita o número de aprendizados ativos por dimensão
  await enforceMaxActiveLearnings(productId, activeLearnings)

  await recordDecision({
    productId,
    actor: 'learning-generator',
    decision: 'GENERATE_LEARNINGS',
    rationale: `${insertedCount} aprendizados gerados a partir de ${rollups28d.length} rollups. Custo: US$ ${costUsd.toFixed(4)}.`,
  })

  return { generated: insertedCount, costUsd }
}

async function enforceMaxActiveLearnings(
  productId: string,
  currentActive: Awaited<ReturnType<typeof listActiveLearnings>>,
): Promise<void> {
  // Agrupa por dimensão
  const byDimension = new Map<string, typeof currentActive>()
  for (const l of currentActive) {
    const key = l.dimension
    const group = byDimension.get(key) ?? []
    group.push(l)
    byDimension.set(key, group)
  }

  for (const [, group] of byDimension) {
    if (group.length <= MAX_ACTIVE_LEARNINGS_PER_DIMENSION) continue

    // Mantém os N mais recentes e com maior confiança
    const sorted = [...group].sort((a, b) => {
      const confDiff = Number(b.confidence) - Number(a.confidence)
      return confDiff !== 0 ? confDiff : b.createdAt.getTime() - a.createdAt.getTime()
    })

    for (const old of sorted.slice(MAX_ACTIVE_LEARNINGS_PER_DIMENSION)) {
      await supersedeLearning(old.id, sorted[0]!.id)
    }
  }
}

// Job semanal — segunda-feira às 05:00 UTC (depois dos rollups diários)
export const generateLearningsCron = schedules.task({
  id: 'generate-learnings-weekly',
  cron: '0 5 * * 1',
  maxDuration: 600,
  run: async () => {
    return generateLearningsTask.triggerAndWait({})
  },
})
