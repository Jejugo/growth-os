import { task, schedules, logger } from '@trigger.dev/sdk'
import { db } from '@/lib/db'
import { eq, and, sql } from 'drizzle-orm'
import { experiments, experimentVariants } from '@/modules/content/schema'
import { recordDecision } from '@/lib/observability/service'

export const evaluateExperimentsTask = task({
  id: 'evaluate-experiments',
  maxDuration: 120,
  run: async () => {
    // Busca experimentos em andamento
    const running = await db
      .select()
      .from(experiments)
      .where(eq(experiments.status, 'running'))

    logger.info('Avaliando experimentos', { count: running.length })

    let concluded = 0

    for (const exp of running) {
      try {
        const concluded_ = await evaluateExperiment(exp)
        if (concluded_) concluded++
      } catch (err) {
        logger.error(`Falha ao avaliar experimento ${exp.id}`, { error: err })
      }
    }

    return { evaluated: running.length, concluded }
  },
})

async function evaluateExperiment(
  exp: typeof experiments.$inferSelect,
): Promise<boolean> {
  const variants = await db
    .select()
    .from(experimentVariants)
    .where(eq(experimentVariants.experimentId, exp.id))

  if (variants.length < 2) return false

  const minSample = exp.minSamplePerVariant ?? 100
  const allReachedSample = variants.every((v) => {
    switch (exp.primaryMetric) {
      case 'paid': return (v.paid ?? 0) >= minSample
      case 'activation': return (v.signups ?? 0) >= minSample
      case 'signup': return (v.signups ?? 0) >= minSample
      default: return (v.clicks ?? 0) >= minSample
    }
  })

  if (!allReachedSample) {
    logger.info(`Experimento ${exp.id} ainda não atingiu amostra mínima`)
    return false
  }

  // Determina vencedor pela métrica primária
  const getMetricValue = (v: typeof experimentVariants.$inferSelect): number => {
    switch (exp.primaryMetric) {
      case 'paid': return v.paid ?? 0
      case 'activation': return v.signups ?? 0
      case 'signup': return v.signups ?? 0
      default: return v.clicks ?? 0
    }
  }

  const sorted = [...variants].sort((a, b) => getMetricValue(b) - getMetricValue(a))
  const winner = sorted[0]
  const control = variants.find((v) => v.isControl)

  // Empate — não conclui automaticamente
  if (sorted.length >= 2 && getMetricValue(sorted[0]!) === getMetricValue(sorted[1]!)) {
    logger.info(`Experimento ${exp.id} está empatado — aguarda intervenção humana`)
    return false
  }

  const winnerMetric = getMetricValue(winner!)
  const controlMetric = control ? getMetricValue(control) : null
  const improvement =
    controlMetric && controlMetric > 0
      ? ((winnerMetric - controlMetric) / controlMetric) * 100
      : null

  const conclusion = [
    `Vencedor: variante "${winner!.label}" (${winner!.name})`,
    improvement !== null
      ? `com ${improvement.toFixed(1)}% de melhora sobre o controle`
      : '',
    `na métrica ${exp.primaryMetric}.`,
    'Confirmação humana necessária para aplicar.',
  ]
    .filter(Boolean)
    .join(' ')

  await db
    .update(experiments)
    .set({
      status: 'concluded',
      winnerVariantId: winner!.id,
      conclusion,
      endedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(experiments.id, exp.id))

  await recordDecision({
    productId: exp.productId,
    actor: 'experiment-evaluator',
    decision: 'CONCLUDE_EXPERIMENT',
    rationale: conclusion,
  })

  logger.info(`Experimento ${exp.id} concluído`, { winner: winner!.label, conclusion })
  return true
}

// Avaliação diária
export const evaluateExperimentsCron = schedules.task({
  id: 'evaluate-experiments-daily',
  cron: '30 4 * * *',
  maxDuration: 120,
  run: async () => {
    return evaluateExperimentsTask.triggerAndWait(undefined)
  },
})
