import { pgTable, text, timestamp, numeric, pgEnum, index } from 'drizzle-orm/pg-core'
import { newId } from '@/lib/ids'
import { products } from '@/modules/products/schema'

/**
 * A tabela nasce na Fase 0 e fica vazia até a Fase 5. O motivo é migração:
 * `missionId` vira FK em campanhas, conteúdo e custos, e acrescentar essa
 * coluna depois, com dados em produção, custa muito mais do que criá-la agora.
 * Nenhuma lógica de missão existe ainda — e não deve existir.
 */

export const missionObjective = pgEnum('mission_objective', [
  'users',
  'signups',
  'paid_customers',
  'reach',
  'followers',
  'revenue',
])

export const missionStatus = pgEnum('mission_status', [
  'draft',
  'active',
  'paused',
  'achieved',
  'missed',
])

export const missions = pgTable(
  'missions',
  {
    id: text('id').primaryKey().$defaultFn(newId),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    objectiveType: missionObjective('objective_type').notNull(),
    targetValue: numeric('target_value', { precision: 14, scale: 2 }).notNull(),
    currentValue: numeric('current_value', { precision: 14, scale: 2 }).notNull().default('0'),
    primaryConversion: text('primary_conversion'),
    secondaryConversion: text('secondary_conversion'),
    targetDate: timestamp('target_date', { withTimezone: true }),
    status: missionStatus('status').notNull().default('draft'),
    strategyNotes: text('strategy_notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('missions_product_idx').on(t.productId, t.createdAt.desc())],
)

export type Mission = typeof missions.$inferSelect
