import type { z } from 'zod'
import type { ModelTier } from './config'

/** Dimensões de custo. Toda chamada carrega o produto a que pertence. */
export interface AICallContext {
  productId?: string
  missionId?: string
  campaignId?: string
}

export interface AIUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

export interface AIResult<T> {
  data: T
  usage: AIUsage
  costUsd: number
  model: string
  latencyMs: number
  callId: string
}

/**
 * Verificação factual pós-parse (roadmap §4.4). O schema Zod garante o
 * *formato*; esta função garante que o conteúdo bate com o banco e com o
 * mundo real. Retorna a lista de problemas — vazia significa aprovado.
 */
export type Verifier<T> = (data: T) => string[] | Promise<string[]>

export interface StructuredRequest<T> {
  /** Identificador estável da tarefa, ex. 'product.analyze.extract'. */
  task: string
  /** Versão semântica do prompt, ex. 'product.analyze.extract@1'. */
  promptVersion: string
  tier: ModelTier
  schema: z.ZodType<T>
  system: string
  prompt: string
  context: AICallContext
  verify?: Verifier<T>
  maxTokens?: number
}

export interface TextRequest {
  task: string
  promptVersion: string
  tier: ModelTier
  system: string
  prompt: string
  context: AICallContext
  maxTokens?: number
}

export interface AIProvider {
  generateStructured<T>(request: StructuredRequest<T>): Promise<AIResult<T>>
  generateText(request: TextRequest): Promise<AIResult<string>>
}

export class AIValidationError extends Error {
  constructor(
    message: string,
    readonly issues: string[],
    readonly task: string,
  ) {
    super(message)
    this.name = 'AIValidationError'
  }
}

export class AIBudgetExceededError extends Error {
  constructor(
    readonly productId: string,
    readonly spentUsd: number,
    readonly budgetUsd: number,
  ) {
    super(
      `Orçamento de IA do produto ${productId} excedido: ` +
        `US$ ${spentUsd.toFixed(2)} de US$ ${budgetUsd.toFixed(2)} no mês.`,
    )
    this.name = 'AIBudgetExceededError'
  }
}

export class AIRefusalError extends Error {
  constructor(
    readonly task: string,
    readonly category: string | null,
  ) {
    super(`O modelo recusou a tarefa ${task}${category ? ` (categoria: ${category})` : ''}.`)
    this.name = 'AIRefusalError'
  }
}
