import { z } from 'zod'
import { ai } from '@/modules/ai'
import { computeConfidence } from '../confidence'
import { getRollupsByIds } from '../repo'
import type { PerformanceRollup, Learning } from '../schema'

export const PROMPT_VERSION = 'analytics.summarize-performance@1'

// --- Schema de saída ---------------------------------------------------------

const learningOutputSchema = z.object({
  learnings: z.array(
    z.object({
      statement: z.string().min(20),
      kind: z.enum(['hypothesis', 'learning']),
      direction: z.enum(['increase', 'decrease', 'keep', 'test']),
      dimension: z.enum(['channel', 'angle', 'theme', 'segment', 'hook_pattern', 'posting_hour', 'format', 'campaign']),
      dimensionValue: z.string(),
      // IDs de rollups que sustentam este aprendizado
      evidenceRollupIds: z.array(z.string()),
    }),
  ),
})

type LearningOutput = z.infer<typeof learningOutputSchema>['learnings'][number]

export type GeneratedLearning = {
  statement: string
  kind: 'hypothesis' | 'learning'
  direction: 'increase' | 'decrease' | 'keep' | 'test'
  dimension: PerformanceRollup['dimension']
  dimensionValue: string
  evidence: Array<{ rollupId: string; metric: string; value: number }>
  confidence: number
}

// --- Prompt do sistema -------------------------------------------------------

const SYSTEM = `Você é analista de desempenho de conteúdo para SaaS. Recebe rollups de métricas calculados em SQL e gera aprendizados estruturados que alimentarão a estratégia de conteúdo.

REGRAS ABSOLUTAS:
1. Cada aprendizado deve citar ao menos um evidenceRollupId da lista fornecida.
2. Todo número mencionado no statement (ex: "4,3x mais signups") deve ser verificável nos rollups citados.
3. dimensionValue deve corresponder EXATAMENTE ao valor da dimensão nos rollups.
4. Dimensões com sample_sufficient=false geram APENAS kind='hypothesis' — nunca 'learning'.
5. Não invente métricas, percentuais ou comparações que não estejam nos dados.
6. O statement deve ser legível em português e incluir os números exatos dos rollups.
7. Máximo de 5 aprendizados por chamada — priorize os mais acionáveis.

DISTINÇÃO IMPORTANTE:
- kind='learning': dimensão com sample_sufficient=true e efeito claro (≥1,5x diferença).
- kind='hypothesis': amostra insuficiente OU efeito pequeno (<1,5x diferença).`

// --- Função principal -------------------------------------------------------

export async function summarizePerformance(input: {
  productId: string
  rollups: PerformanceRollup[]
  activeLearnings: Learning[]
}): Promise<{ learnings: GeneratedLearning[]; callId: string; costUsd: number }> {
  const { rollups, activeLearnings } = input

  if (rollups.length === 0) {
    return { learnings: [], callId: '', costUsd: 0 }
  }

  // Constrói o contexto de rollups para o prompt
  const rollupLines = rollups.map((r) => {
    const sufficient = r.sampleSufficient ? '✓ suficiente' : '⚠ insuficiente'
    return [
      `[${r.id}] ${r.dimension}=${r.dimensionValue} | janela=${r.windowKind}`,
      `  posts=${r.posts} cliques=${r.clicks} signups=${r.signups} pagos=${r.paid}`,
      `  clickRate=${Number(r.clickRate).toFixed(4)} signupRate=${Number(r.signupRate).toFixed(4)} paidRate=${Number(r.paidRate).toFixed(4)}`,
      `  amostra: ${sufficient}`,
    ].join('\n')
  })

  const activeLearningLines =
    activeLearnings.length > 0
      ? activeLearnings.map(
          (l) => `• [${l.dimension}=${l.dimensionValue}] ${l.statement} (dir=${l.direction}, conf=${l.confidence})`,
        )
      : ['Nenhum aprendizado ativo ainda.']

  const result = await ai().generateStructured({
    task: 'analytics.summarize-performance',
    promptVersion: PROMPT_VERSION,
    tier: 'strong',
    schema: learningOutputSchema,
    system: SYSTEM,
    prompt: [
      '<rollups_de_performance>',
      rollupLines.join('\n\n'),
      '</rollups_de_performance>',
      '',
      '<aprendizados_ativos_atuais>',
      activeLearningLines.join('\n'),
      '</aprendizados_ativos_atuais>',
      '',
      'Analise os rollups e gere até 5 aprendizados acionáveis.',
      'Para cada aprendizado, cite os IDs de rollup que o sustentam em evidenceRollupIds.',
      'Foque nas dimensões com maior diferença relativa de signupRate entre valores.',
    ].join('\n'),
    context: { productId: input.productId },
    verify: async (data) => {
      const issues: string[] = []
      const rollupById = new Map(rollups.map((r) => [r.id, r]))

      for (const l of data.learnings) {
        // Valida que evidenceRollupIds existem
        for (const rid of l.evidenceRollupIds) {
          if (!rollupById.has(rid)) {
            issues.push(`Rollup ${rid} citado em evidência não existe na lista.`)
          }
        }

        // Dimensões com amostra insuficiente devem ser hypothesis
        const evidenceRollups = l.evidenceRollupIds.map((id) => rollupById.get(id)).filter(Boolean)
        const allInsufficient = evidenceRollups.every((r) => !r!.sampleSufficient)
        if (allInsufficient && l.kind === 'learning') {
          issues.push(
            `Aprendizado sobre ${l.dimension}=${l.dimensionValue} cita apenas rollups com amostra insuficiente — deve ser 'hypothesis'.`,
          )
        }

        if (l.statement.trim().length < 20) {
          issues.push('Statement muito curto.')
        }
      }

      return issues
    },
  })

  // Calcula confiança determinística para cada aprendizado
  const generatedLearnings: GeneratedLearning[] = []

  for (const l of result.data.learnings) {
    const evidenceRollups = await getRollupsByIds(l.evidenceRollupIds)
    if (evidenceRollups.length === 0) continue

    // Baseline: mediana do signupRate de todos os rollups da mesma dimensão
    const sameRollups = rollups.filter((r) => r.dimension === l.dimension)
    const rates = sameRollups.map((r) => Number(r.signupRate)).sort((a, b) => a - b)
    const median = rates[Math.floor(rates.length / 2)] ?? null

    // Usa o rollup de maior amostra como representativo
    const primary = evidenceRollups.reduce((best, r) =>
      (r.signups ?? 0) > (best.signups ?? 0) ? r : best,
    )

    const confidence = computeConfidence(primary, median)

    const evidence = evidenceRollups.map((r) => ({
      rollupId: r.id,
      metric: 'signupRate',
      value: Number(r.signupRate),
    }))

    generatedLearnings.push({
      statement: l.statement,
      kind: l.kind,
      direction: l.direction,
      dimension: l.dimension as PerformanceRollup['dimension'],
      dimensionValue: l.dimensionValue,
      evidence,
      confidence,
    })
  }

  return {
    learnings: generatedLearnings,
    callId: result.callId,
    costUsd: result.costUsd,
  }
}
