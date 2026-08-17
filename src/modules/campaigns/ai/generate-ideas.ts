import { z } from 'zod'
import { ai } from '@/modules/ai'
import { type GeneratedIdea } from '../types'
import type { ProductProfile } from '@/modules/products/schema'
import type { AudienceSegment } from '@/modules/audiences/schema'
import type { ContentTheme } from '../schema'
import type { ContentAngle } from '@/modules/content/types'
import { CONTENT_ANGLES } from '@/modules/content/types'
import type { Learning } from '@/modules/analytics/schema'

export const PROMPT_VERSION = 'campaigns.generate-ideas@1'

const ideaOutputSchema = z.object({
  title: z.string(),
  summary: z.string(),
  supportingFacts: z.array(z.string()).nullable(),
})

const SYSTEM = `Você é gerador de ideias de conteúdo para SaaS. Recebe um produto, uma audiência, um tema e um ângulo específico e gera UMA ideia de conteúdo concreta.

Regras:
- A ideia deve explorar o ângulo especificado — não desvie para outros ângulos.
- title: título concreto do post/artigo (não genérico, não "Como X" de forma vaga).
- summary: o que o conteúdo vai dizer, em 2–3 frases. Mencione o ângulo explicitamente.
- supportingFacts: fatos, dados ou exemplos do perfil do produto que sustentam este ângulo.
  Para ângulos "data_research" e "case_study", pelo menos 1 fato concreto é obrigatório.
  Se não houver fatos para um ângulo que exige dado, sinalize com lista vazia — o gerador
  vai excluir este ângulo da seleção.
- Não invente dados, percentuais ou resultados. Baseie-se apenas nos fatos fornecidos.
- A ideia deve ser específica o bastante para alguém escrever o post sem pesquisa adicional.`

/**
 * Gera UMA ideia para um ângulo específico. Chamada N vezes, produz variedade real.
 * (Pedir variedade a um LLM produz variedade superficial — forçar o ângulo, não.)
 */
export async function generateIdeaForAngle(input: {
  productId: string
  profile: ProductProfile
  theme: ContentTheme
  segment: AudienceSegment
  angle: ContentAngle
  recentIdeas: string[]
}): Promise<{ idea: GeneratedIdea; callId: string; costUsd: number }> {
  const { profile, theme, segment, angle, recentIdeas } = input

  const contextBlock = [
    `Produto: ${profile.productName ?? ''}`,
    `Uma linha: ${profile.oneLiner ?? ''}`,
    `Problema principal: ${profile.primaryProblem ?? ''}`,
    `Proposta de valor: ${profile.valueProposition ?? ''}`,
    `Diferenciais: ${profile.data.differentiators.join(', ') || 'nenhum'}`,
  ].join('\n')

  const themeBlock = `Tema: ${theme.name}\n${theme.description}\nKeywords: ${theme.keywords.join(', ')}`

  const segmentBlock = `Audiência-alvo: ${segment.name}\n${segment.description}\nDores: ${segment.painPoints.join(', ')}`

  const angleDesc = ANGLE_DESCRIPTIONS[angle]
  const recentBlock =
    recentIdeas.length > 0
      ? `Ideias recentes (evitar repetição):\n${recentIdeas.slice(0, 10).map((t) => `• ${t}`).join('\n')}`
      : ''

  const result = await ai().generateStructured({
    task: 'campaigns.generate-ideas',
    promptVersion: PROMPT_VERSION,
    tier: 'standard',
    schema: ideaOutputSchema,
    system: SYSTEM,
    prompt: [
      '<contexto_do_produto>',
      contextBlock,
      '</contexto_do_produto>',
      '',
      '<tema>',
      themeBlock,
      '</tema>',
      '',
      '<audiencia>',
      segmentBlock,
      '</audiencia>',
      '',
      `<angulo_obrigatorio>`,
      `${angle}: ${angleDesc}`,
      `</angulo_obrigatorio>`,
      '',
      recentBlock,
      '',
      `Gere UMA ideia de conteúdo usando EXCLUSIVAMENTE o ângulo "${angle}".`,
    ]
      .filter(Boolean)
      .join('\n'),
    context: { productId: input.productId },
    verify: (data) => {
      const issues: string[] = []

      if (data.title.trim().length < 10) {
        issues.push('O título está curto demais.')
      }
      if (data.summary.trim().length < 30) {
        issues.push('O resumo está curto demais.')
      }

      // Ângulos que exigem dado concreto: se não há fatos, a ideia não é válida
      const dataRequiredAngles: ContentAngle[] = ['data_research', 'case_study']
      if (dataRequiredAngles.includes(angle) && (!data.supportingFacts || data.supportingFacts.length === 0)) {
        issues.push(`Ângulo "${angle}" exige ao menos um fato de suporte nos supportingFacts.`)
      }

      return issues
    },
  })

  return { idea: result.data, callId: result.callId, costUsd: result.costUsd }
}

// --- Distribuição de ângulos (lógica determinística em código) -----------

export const MAX_ANGLE_FRACTION = 0.40   // teto: nenhum ângulo passa de 40%
export const MIN_ANGLE_FRACTION = 0.02   // piso: nenhum ângulo vai a zero
export const EXPLORATION_FRACTION = 0.25 // 25% das ideias ignoram aprendizados

export type AnglePlan = {
  angle: ContentAngle
  isExploration: boolean
}

/**
 * Calcula quais ângulos usar na semana com suporte a pesos de aprendizado.
 *
 * - 25% das ideias são "exploração" (sem pesos — escolha uniforme dos menos usados).
 * - 75% são guiados por desempenho histórico.
 * - Teto de 40% e piso de 2% por ângulo — nenhum ângulo é eliminado.
 */
export function selectAnglesForWeek(input: {
  totalIdeas: number
  recentAngleCounts: Record<string, number>
  // Aprendizados ativos para a dimensão 'angle'
  angleLearnings?: Learning[]
  // Mapa de signupRate por ângulo (dos rollups) — valores 0-1
  angleSignupRates?: Partial<Record<string, number>>
}): AnglePlan[] {
  const { totalIdeas, recentAngleCounts, angleLearnings = [], angleSignupRates = {} } = input

  const explorationSlots = Math.ceil(totalIdeas * EXPLORATION_FRACTION)
  const learningSlots = totalIdeas - explorationSlots

  // --- Pesos determinísticos por ângulo ---
  const weights = computeAngleWeights(angleLearnings, angleSignupRates)

  // --- Slots guiados por aprendizado (ordem ponderada) ---
  const guidedAngles = selectWeightedAngles(
    learningSlots,
    weights,
    recentAngleCounts,
  )

  // --- Slots de exploração (uniforme, priorizando menos usados) ---
  const explorationAngles = selectExplorationAngles(
    explorationSlots,
    recentAngleCounts,
  )

  const plan: AnglePlan[] = [
    ...guidedAngles.map((a) => ({ angle: a, isExploration: false })),
    ...explorationAngles.map((a) => ({ angle: a, isExploration: true })),
  ]

  return plan
}

function computeAngleWeights(
  angleLearnings: Learning[],
  angleSignupRates: Partial<Record<string, number>>,
): Record<ContentAngle, number> {
  const weights: Record<string, number> = {}

  // Peso base normalizado por signupRate (se disponível)
  const rates = Object.values(angleSignupRates).filter((v): v is number => v !== undefined)
  const maxRate = rates.length > 0 ? Math.max(...rates) : 0
  const minRate = rates.length > 0 ? Math.min(...rates) : 0
  const range = maxRate - minRate || 1

  for (const angle of CONTENT_ANGLES) {
    const rate = angleSignupRates[angle]
    if (rate !== undefined && range > 0) {
      // Normaliza para [0.5, 2.0] baseado na performance relativa
      weights[angle] = 0.5 + ((rate - minRate) / range) * 1.5
    } else {
      weights[angle] = 1.0
    }
  }

  // Ajusta pesos pelos aprendizados (direção + confiança)
  for (const l of angleLearnings) {
    const angle = l.dimensionValue as ContentAngle
    if (!(angle in weights)) continue
    const conf = Number(l.confidence)
    switch (l.direction) {
      case 'increase':
        weights[angle] = (weights[angle] ?? 1) * (1 + conf * 0.5)
        break
      case 'decrease':
        weights[angle] = (weights[angle] ?? 1) * (1 - conf * 0.3)
        break
    }
  }

  // Aplica teto/piso como fração e renormaliza
  const total = Object.values(weights).reduce((s, w) => s + w, 0)
  const n = CONTENT_ANGLES.length
  const minFraction = MIN_ANGLE_FRACTION
  const maxFraction = MAX_ANGLE_FRACTION

  const normalized: Record<ContentAngle, number> = {} as Record<ContentAngle, number>
  for (const angle of CONTENT_ANGLES) {
    const raw = (weights[angle] ?? 1) / total
    normalized[angle] = Math.max(minFraction, Math.min(maxFraction, raw))
  }

  // Segunda renormalização após clamping
  const total2 = Object.values(normalized).reduce((s, w) => s + w, 0)
  for (const angle of CONTENT_ANGLES) {
    normalized[angle] = normalized[angle] / total2
  }

  return normalized
}

function selectWeightedAngles(
  count: number,
  weights: Record<ContentAngle, number>,
  recentAngleCounts: Record<string, number>,
): ContentAngle[] {
  const selected: ContentAngle[] = []
  const budget: Record<string, number> = {}

  // Distribui slots proporcionalmente ao peso, com limite por ângulo
  for (const angle of CONTENT_ANGLES) {
    const allocated = Math.round(weights[angle] * count)
    budget[angle] = Math.max(1, allocated)
  }

  // Ordena dos menos usados recentemente (favorece diversidade)
  const sorted = [...CONTENT_ANGLES].sort((a, b) => {
    const aCount = recentAngleCounts[a] ?? 0
    const bCount = recentAngleCounts[b] ?? 0
    const aWeight = weights[a] ?? 0
    const bWeight = weights[b] ?? 0
    // Score: alta weight + pouco uso recente = prioridade maior
    return (bWeight - aWeight) * 2 + (aCount - bCount) * 0.5
  })

  for (const angle of sorted) {
    while ((budget[angle] ?? 0) > 0 && selected.length < count) {
      selected.push(angle)
      budget[angle] = (budget[angle] ?? 1) - 1
    }
    if (selected.length >= count) break
  }

  // Preenche ciclicamente se necessário
  let i = 0
  while (selected.length < count) {
    selected.push(sorted[i % sorted.length]!)
    i++
  }

  return selected.slice(0, count)
}

function selectExplorationAngles(
  count: number,
  recentAngleCounts: Record<string, number>,
): ContentAngle[] {
  // Exploração: uniforme, prioriza os ângulos menos usados recentemente
  const sorted = [...CONTENT_ANGLES].sort((a, b) => {
    const aCount = recentAngleCounts[a] ?? 0
    const bCount = recentAngleCounts[b] ?? 0
    return aCount - bCount
  })

  const selected: ContentAngle[] = []
  let i = 0
  while (selected.length < count) {
    selected.push(sorted[i % sorted.length]!)
    i++
  }

  return selected.slice(0, count)
}

// --- Rótulos e descrições de ângulo (usados no prompt) ------------------

const ANGLE_DESCRIPTIONS: Record<ContentAngle, string> = {
  problem: 'Explora e aprofunda o problema central do cliente, fazendo-o se reconhecer na dor descrita.',
  solution: 'Apresenta como a solução aborda o problema de uma forma específica e concreta.',
  how_to: 'Tutorial passo a passo que ensina a fazer algo relevante para a audiência.',
  case_study: 'Estudo de caso com resultado mensurável — o que mudou, como e por quê.',
  comparison: 'Compara abordagens ou soluções alternativas (sem citar concorrentes pelo nome).',
  data_research: 'Compartilha dado, pesquisa ou estatística relevante com análise própria.',
  myth_busting: 'Destrói uma crença equivocada comum no mercado da audiência-alvo.',
  opinion: 'Perspectiva ou ponto de vista próprio sobre uma questão do setor.',
  trend: 'Tendência emergente que a audiência ainda não percebeu ou está subestimando.',
  story: 'Narrativa real ou jornada que ilustra um aprendizado relevante.',
  quick_tip: 'Dica rápida e imediatamente aplicável, sem setup longo.',
  deep_dive: 'Análise profunda de um tópico, cobrindo nuances que posts curtos ignoram.',
  contrarian: 'Visão que contradiz o senso comum dominante, com argumentação sólida.',
  authority: 'Demonstração de expertise ou credencial que constrói confiança no produto.',
}
