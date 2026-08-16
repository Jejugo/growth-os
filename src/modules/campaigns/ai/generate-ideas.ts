import { z } from 'zod'
import { ai } from '@/modules/ai'
import { type GeneratedIdea } from '../types'
import type { ProductProfile } from '@/modules/products/schema'
import type { AudienceSegment } from '@/modules/audiences/schema'
import type { ContentTheme } from '../schema'
import type { ContentAngle } from '@/modules/content/types'
import { CONTENT_ANGLES } from '@/modules/content/types'

export const PROMPT_VERSION = 'campaigns.generate-ideas@1'

const ideaOutputSchema = z.object({
  title: z.string(),
  summary: z.string(),
  supportingFacts: z.array(z.string()).optional(),
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

export const MAX_ANGLE_PERCENTAGE = 0.3

/**
 * Calcula quais ângulos usar na semana para manter diversidade.
 * Nenhum ângulo pode representar mais de 30% das ideias geradas.
 */
export function selectAnglesForWeek(input: {
  totalIdeas: number
  recentAngleCounts: Record<string, number>
}): ContentAngle[] {
  const { totalIdeas, recentAngleCounts } = input
  const maxPerAngle = Math.ceil(totalIdeas * MAX_ANGLE_PERCENTAGE)

  // Ordena ângulos dos menos usados para os mais usados
  const sorted = [...CONTENT_ANGLES].sort((a, b) => {
    const aCount = recentAngleCounts[a] ?? 0
    const bCount = recentAngleCounts[b] ?? 0
    return aCount - bCount
  })

  const selected: ContentAngle[] = []
  const angleBudget: Record<string, number> = {}

  for (const angle of sorted) {
    if (selected.length >= totalIdeas) break

    const used = angleBudget[angle] ?? 0
    if (used < maxPerAngle) {
      selected.push(angle)
      angleBudget[angle] = used + 1
    }
  }

  // Se não atingiu o total, preenche ciclicamente com os ângulos menos usados
  let i = 0
  while (selected.length < totalIdeas) {
    const angle = sorted[i % sorted.length]!
    selected.push(angle)
    i++
  }

  return selected.slice(0, totalIdeas)
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
