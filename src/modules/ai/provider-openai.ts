import OpenAI from 'openai'
import { zodResponseFormat } from 'openai/helpers/zod'
import { env } from '@/lib/env'
import { OPENAI_MODELS, estimateCostUsd, type ModelConfig, type ModelTier } from './config'
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

const ZERO_USAGE: AIUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }

let client: OpenAI | undefined
function openai(): OpenAI {
  client ??= new OpenAI({ apiKey: env().OPENAI_API_KEY })
  return client
}

function readUsage(usage: OpenAI.CompletionUsage | undefined): AIUsage {
  if (!usage) return ZERO_USAGE
  return {
    inputTokens: usage.prompt_tokens ?? 0,
    outputTokens: usage.completion_tokens ?? 0,
    cacheReadTokens: (usage as { prompt_tokens_details?: { cached_tokens?: number } }).prompt_tokens_details?.cached_tokens ?? 0,
    cacheWriteTokens: 0,
  }
}

async function assertWithinBudget(productId: string | undefined): Promise<void> {
  if (!productId) return
  const budget = env().AI_MONTHLY_BUDGET_USD_PER_PRODUCT
  const spent = await spendThisMonth(productId)
  if (spent >= budget) throw new AIBudgetExceededError(productId, spent, budget)
}

export class OpenAIProvider implements AIProvider {
  async generateStructured<T>(request: StructuredRequest<T>): Promise<AIResult<T>> {
    await assertWithinBudget(request.context.productId)

    const model = OPENAI_MODELS[request.tier]
    let correction: string | undefined

    for (let attempt = 1; attempt <= 2; attempt++) {
      const startedAt = Date.now()
      let usage = ZERO_USAGE

      try {
        const response = await openai().chat.completions.parse({
          model: model.id,
          max_tokens: request.maxTokens ?? model.maxTokens,
          messages: [
            { role: 'system', content: request.system },
            {
              role: 'user',
              content: correction
                ? `${request.prompt}\n\n<correcao_necessaria>\nSua resposta anterior foi rejeitada:\n${correction}\nCorrija e responda de novo.\n</correcao_necessaria>`
                : request.prompt,
            },
          ],
          response_format: zodResponseFormat(request.schema, 'result'),
        })

        usage = readUsage(response.usage)
        const parsed = response.choices[0]?.message.parsed

        if (parsed == null) {
          correction = 'A resposta não pôde ser interpretada no schema exigido.'
          await this.record(request, model, usage, startedAt, attempt, 'invalid', correction)
          if (attempt === 2) throw new AIValidationError(`Saída de ${request.task} inválida após 2 tentativas.`, [correction], request.task)
          continue
        }

        const issues = (await request.verify?.(parsed)) ?? []
        if (issues.length > 0) {
          correction = issues.map((i) => `- ${i}`).join('\n')
          await this.record(request, model, usage, startedAt, attempt, 'invalid', issues.join('; '))
          if (attempt === 2) throw new AIValidationError(`Saída de ${request.task} reprovada na verificação factual após 2 tentativas.`, issues, request.task)
          continue
        }

        const callId = await this.record(request, model, usage, startedAt, attempt, 'ok')
        return { data: parsed, usage, costUsd: estimateCostUsd(request.tier, usage), model: model.id, latencyMs: Date.now() - startedAt, callId }
      } catch (error) {
        if (error instanceof AIValidationError || error instanceof AIRefusalError) throw error
        await this.record(request, model, usage, startedAt, attempt, 'error', error instanceof Error ? error.message : String(error))
        throw error
      }
    }

    throw new AIValidationError(`Saída de ${request.task} inválida após 2 tentativas.`, [correction ?? 'motivo desconhecido'], request.task)
  }

  async generateText(request: TextRequest): Promise<AIResult<string>> {
    await assertWithinBudget(request.context.productId)

    const model = OPENAI_MODELS[request.tier]
    const startedAt = Date.now()
    let usage = ZERO_USAGE

    try {
      const response = await openai().chat.completions.create({
        model: model.id,
        max_tokens: request.maxTokens ?? model.maxTokens,
        messages: [
          { role: 'system', content: request.system },
          { role: 'user', content: request.prompt },
        ],
      })

      usage = readUsage(response.usage)
      const text = response.choices[0]?.message.content ?? ''

      const callId = await this.record(request, model, usage, startedAt, 1, 'ok')
      return { data: text, usage, costUsd: estimateCostUsd(request.tier, usage), model: model.id, latencyMs: Date.now() - startedAt, callId }
    } catch (error) {
      await this.record(request, model, usage, startedAt, 1, 'error', error instanceof Error ? error.message : String(error))
      throw error
    }
  }

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
