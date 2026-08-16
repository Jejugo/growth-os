import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { env } from '@/lib/env'
import { MODELS, estimateCostUsd, type ModelConfig, type ModelTier } from './config'
import { insertAiCall, spendThisMonth } from './repo'
import {
  AIBudgetExceededError,
  AIRefusalError,
  AIValidationError,
  type AIProvider,
  type AIResult,
  type AIUsage,
  type StructuredRequest,
  type TextRequest,
} from './types'

const ZERO_USAGE: AIUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
}

let client: Anthropic | undefined
function anthropic(): Anthropic {
  client ??= new Anthropic({ apiKey: env().ANTHROPIC_API_KEY })
  return client
}

/**
 * Monta os parâmetros que variam por modelo. Haiku 4.5 rejeita `effort`, e
 * Opus 5 já pensa por padrão — codificar isso como dados evita `if (model ===
 * ...)` espalhado pela base.
 */
function modelParams(m: ModelConfig): Record<string, unknown> {
  const params: Record<string, unknown> = {}
  if (m.thinking === 'adaptive') params.thinking = { type: 'adaptive' }
  return params
}

function outputConfig(m: ModelConfig, format?: unknown): Record<string, unknown> | undefined {
  const cfg: Record<string, unknown> = {}
  if (m.effort) cfg.effort = m.effort
  if (format) cfg.format = format
  return Object.keys(cfg).length > 0 ? cfg : undefined
}

function readUsage(usage: Anthropic.Usage | undefined): AIUsage {
  if (!usage) return ZERO_USAGE
  return {
    inputTokens: usage.input_tokens ?? 0,
    outputTokens: usage.output_tokens ?? 0,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
  }
}

/**
 * Guarda de orçamento. Um crawl ou um prompt em loop pode custar caro sem que
 * ninguém perceba; este é o único ponto por onde todo gasto passa.
 */
async function assertWithinBudget(productId: string | undefined): Promise<void> {
  if (!productId) return
  const budget = env().AI_MONTHLY_BUDGET_USD_PER_PRODUCT
  const spent = await spendThisMonth(productId)
  if (spent >= budget) throw new AIBudgetExceededError(productId, spent, budget)
}

class AnthropicProvider implements AIProvider {
  async generateStructured<T>(request: StructuredRequest<T>): Promise<AIResult<T>> {
    await assertWithinBudget(request.context.productId)

    const model = MODELS[request.tier]
    let correction: string | undefined

    // Uma tentativa de correção com o erro no prompt, depois erro duro.
    for (let attempt = 1; attempt <= 2; attempt++) {
      const startedAt = Date.now()
      let usage = ZERO_USAGE

      try {
        const response = await anthropic().messages.parse({
          model: model.id,
          max_tokens: request.maxTokens ?? model.maxTokens,
          system: request.system,
          messages: [
            {
              role: 'user',
              content: correction
                ? `${request.prompt}\n\n<correcao_necessaria>\nSua resposta anterior foi rejeitada:\n${correction}\nCorrija e responda de novo.\n</correcao_necessaria>`
                : request.prompt,
            },
          ],
          output_config: outputConfig(model, zodOutputFormat(request.schema)),
          ...modelParams(model),
        })

        usage = readUsage(response.usage)

        if (response.stop_reason === 'refusal') {
          const category = response.stop_details?.category ?? null
          await this.record(request, model, usage, startedAt, attempt, 'error', `refusal:${category}`)
          throw new AIRefusalError(request.task, category)
        }

        const parsed = response.parsed_output
        if (parsed == null) {
          correction = 'A resposta não pôde ser interpretada no schema exigido.'
          await this.record(request, model, usage, startedAt, attempt, 'invalid', correction)
          continue
        }

        // Schema garante o formato; a verificação factual garante o conteúdo.
        const issues = (await request.verify?.(parsed)) ?? []
        if (issues.length > 0) {
          correction = issues.map((i) => `- ${i}`).join('\n')
          const callId = await this.record(
            request,
            model,
            usage,
            startedAt,
            attempt,
            'invalid',
            issues.join('; '),
          )
          if (attempt === 2) {
            throw new AIValidationError(
              `Saída de ${request.task} reprovada na verificação factual após 2 tentativas.`,
              issues,
              request.task,
            )
          }
          void callId
          continue
        }

        const callId = await this.record(request, model, usage, startedAt, attempt, 'ok')
        return {
          data: parsed,
          usage,
          costUsd: estimateCostUsd(request.tier, usage),
          model: model.id,
          latencyMs: Date.now() - startedAt,
          callId,
        }
      } catch (error) {
        if (error instanceof AIValidationError || error instanceof AIRefusalError) throw error
        await this.record(
          request,
          model,
          usage,
          startedAt,
          attempt,
          'error',
          error instanceof Error ? error.message : String(error),
        )
        throw error
      }
    }

    throw new AIValidationError(
      `Saída de ${request.task} inválida após 2 tentativas.`,
      [correction ?? 'motivo desconhecido'],
      request.task,
    )
  }

  async generateText(request: TextRequest): Promise<AIResult<string>> {
    await assertWithinBudget(request.context.productId)

    const model = MODELS[request.tier]
    const startedAt = Date.now()
    let usage = ZERO_USAGE

    try {
      const response = await anthropic().messages.create({
        model: model.id,
        max_tokens: request.maxTokens ?? model.maxTokens,
        system: request.system,
        messages: [{ role: 'user', content: request.prompt }],
        ...(outputConfig(model) ? { output_config: outputConfig(model) } : {}),
        ...modelParams(model),
      })

      usage = readUsage(response.usage)

      if (response.stop_reason === 'refusal') {
        const category = response.stop_details?.category ?? null
        await this.record(request, model, usage, startedAt, 1, 'error', `refusal:${category}`)
        throw new AIRefusalError(request.task, category)
      }

      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('')

      const callId = await this.record(request, model, usage, startedAt, 1, 'ok')
      return {
        data: text,
        usage,
        costUsd: estimateCostUsd(request.tier, usage),
        model: model.id,
        latencyMs: Date.now() - startedAt,
        callId,
      }
    } catch (error) {
      if (error instanceof AIRefusalError) throw error
      await this.record(
        request,
        model,
        usage,
        startedAt,
        1,
        'error',
        error instanceof Error ? error.message : String(error),
      )
      throw error
    }
  }

  /** Grava em `ai_calls` inclusive quando a chamada falhou. */
  private async record(
    request: StructuredRequest<unknown> | TextRequest,
    model: ModelConfig,
    usage: AIUsage,
    startedAt: number,
    attempt: number,
    status: 'ok' | 'invalid' | 'error',
    errorMessage?: string,
  ): Promise<string> {
    return insertAiCall({
      task: request.task,
      promptVersion: request.promptVersion,
      tier: request.tier as ModelTier,
      model: model.id,
      productId: request.context.productId,
      missionId: request.context.missionId,
      campaignId: request.context.campaignId,
      ...usage,
      costUsd: estimateCostUsd(request.tier, usage),
      latencyMs: Date.now() - startedAt,
      attempt,
      status,
      errorMessage,
    })
  }
}

let provider: AIProvider | undefined

/** Ponto único de acesso ao LLM. Nenhuma chamada acontece fora daqui. */
export function ai(): AIProvider {
  provider ??= new AnthropicProvider()
  return provider
}

/** Só para testes: injeta um provider falso. */
export function __setAiProvider(fake: AIProvider | undefined): void {
  provider = fake
}
