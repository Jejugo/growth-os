import { task, schedules, logger } from '@trigger.dev/sdk'
import { findDueValidations, concludeValidationById } from '@/modules/validation'

/**
 * Fecha validações cujo `endsAt` já passou: roda o gate determinístico, pede
 * a justificativa ao LLM e grava o veredito. Idempotente por `validationId` —
 * `concludeValidationById` só age sobre validações ainda `running`.
 */
export const concludeValidationTask = task({
  id: 'conclude-validation',
  maxDuration: 300,
  run: async () => {
    const due = await findDueValidations(new Date())
    logger.info('Concluindo validações vencidas', { count: due.length })

    let concluded = 0
    let failed = 0

    for (const validation of due) {
      try {
        const result = await concludeValidationById(validation.id)
        if (result) concluded++
        logger.info(`Validação ${validation.id} concluída`, result ?? undefined)
      } catch (err) {
        failed++
        logger.error(`Falha ao concluir validação ${validation.id}`, { error: err })
      }
    }

    return { evaluated: due.length, concluded, failed }
  },
})

export const concludeValidationCron = schedules.task({
  id: 'conclude-validation-daily',
  cron: '0 6 * * *',
  maxDuration: 300,
  run: async () => {
    return concludeValidationTask.triggerAndWait(undefined)
  },
})
