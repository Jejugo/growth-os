import type { AnalyzeProductPayload } from './analyze-product'
import type { PlanContentWeekPayload } from './plan-content-week'
import type { GenerateValidationContentPayload } from './generate-validation-content'

/**
 * Chaves de idempotência dos triggers, extraídas pra um módulo sem nenhum `task()` — importável
 * tanto pela task (via `run()`) quanto pelo dispatcher em `src/server/jobs.ts` sem puxar o código
 * pesado da task (e o registro do `task()` em si) pro bundle do Next.js. Ver nota em
 * `dispatchPublishLandingDraft` sobre por que isso importa: chamar `.trigger()` no objeto real da
 * task dentro de uma Server Action builda a task inteira no app e pode falhar silenciosamente.
 */

export function analyzeProductIdempotencyKey(payload: AnalyzeProductPayload, now = new Date()): string {
  const hour = now.toISOString().slice(0, 13) // YYYY-MM-DDTHH
  const suffix = payload.force ? `:force:${now.getTime()}` : ''
  return `analyze-product:${payload.productId}:${hour}${suffix}`
}

export function isoWeek(date: Date): string {
  // Formato: YYYY-Www (semana ISO 8601)
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7))
  const week1 = new Date(d.getFullYear(), 0, 4)
  const weekNum = Math.round(
    ((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7,
  )
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`
}

export function planContentWeekIdempotencyKey(payload: PlanContentWeekPayload, now = new Date()): string {
  const week = payload.weekOf ?? isoWeek(now)
  return `plan-week:${payload.productId}:${week}`
}

export function generateValidationContentIdempotencyKey(payload: GenerateValidationContentPayload): string {
  return `generate-validation-content:${payload.validationId}`
}
