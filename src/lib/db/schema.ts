/**
 * Barril de schemas. É o que o drizzle-kit lê para gerar migrations e o que o
 * cliente Drizzle recebe. Cada módulo continua dono do seu arquivo.
 */

export * from '@/modules/auth/schema'
export * from '@/modules/products/schema'
export * from '@/modules/missions/schema'
export * from '@/modules/audiences/schema'
export * from '@/modules/campaigns/schema'
export * from '@/modules/content/schema'
export * from '@/modules/ai/schema'
export * from '@/lib/observability/schema'
export * from '@/modules/distribution/schema'
export * from '@/modules/attribution/schema'
