import { task, schedules, logger } from '@trigger.dev/sdk'
import { computeRollups } from '@/modules/analytics/rollup'
import { findProductIdsByStage } from '@/modules/products/repo'

export const computeRollupsTask = task({
  id: 'compute-rollups',
  maxDuration: 300,
  run: async (payload: { productId?: string }) => {
    // Se não informado, processa todos os produtos lançados — produto em
    // validação não deve alimentar rollups que o aprendizado global lê
    // (fase 4.5, roadmap Riscos).
    const productIds = payload.productId
      ? [payload.productId]
      : await findProductIdsByStage(['launched'])

    logger.info('Iniciando cálculo de rollups', { count: productIds.length })

    let success = 0
    let failed = 0

    for (const productId of productIds) {
      try {
        await computeRollups(productId)
        success++
        logger.info(`Rollups calculados para ${productId}`)
      } catch (err) {
        failed++
        logger.error(`Falha ao calcular rollups para ${productId}`, { error: err })
      }
    }

    logger.info('Cálculo de rollups concluído', { success, failed })
    return { success, failed }
  },
})

// Job diário às 04:00 no UTC (ajuste pelo fuso do usuário se necessário)
export const computeRollupsCron = schedules.task({
  id: 'compute-rollups-daily',
  cron: '0 4 * * *',
  maxDuration: 300,
  run: async () => {
    return computeRollupsTask.triggerAndWait({})
  },
})
