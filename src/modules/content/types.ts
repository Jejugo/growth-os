import { z } from 'zod'

// --- Ângulos de conteúdo (14 valores) ------------------------------------

export const CONTENT_ANGLES = [
  'problem',
  'solution',
  'how_to',
  'case_study',
  'comparison',
  'data_research',
  'myth_busting',
  'opinion',
  'trend',
  'story',
  'quick_tip',
  'deep_dive',
  'contrarian',
  'authority',
] as const

export type ContentAngle = (typeof CONTENT_ANGLES)[number]

export const ANGLE_LABELS: Record<ContentAngle, string> = {
  problem: 'Problema do cliente',
  solution: 'Solução e abordagem',
  how_to: 'Tutorial passo a passo',
  case_study: 'Estudo de caso',
  comparison: 'Comparação com alternativas',
  data_research: 'Dado e pesquisa',
  myth_busting: 'Destrói mito',
  opinion: 'Opinião e perspectiva',
  trend: 'Tendência de mercado',
  story: 'Narrativa real',
  quick_tip: 'Dica rápida',
  deep_dive: 'Exploração profunda',
  contrarian: 'Visão contrária',
  authority: 'Demonstração de expertise',
}

// --- Capacidades de canal (determinísticas — nunca inventadas pelo LLM) --

export interface ChannelCapabilities {
  maxChars: number
  supportsLinks: boolean
  supportsImages: boolean
  tone: string
  notes: string
}

export const CHANNEL_CAPABILITIES: Record<string, ChannelCapabilities> = {
  bluesky: {
    maxChars: 300,
    supportsLinks: true,
    supportsImages: true,
    tone: 'conversacional, autêntico, sem jargão corporativo',
    notes: 'Posts curtos e diretos. Um link no final se necessário.',
  },
  linkedin: {
    maxChars: 3000,
    supportsLinks: true,
    supportsImages: true,
    tone: 'profissional mas humano, sem buzzwords vazios',
    notes: 'Primeira linha (hook) é o que aparece antes do "ver mais". Quebras de linha ajudam a leitura.',
  },
  reddit: {
    maxChars: 10000,
    supportsLinks: false,
    supportsImages: false,
    tone: 'autêntico, orientado à comunidade, antipublicitário',
    notes: 'Sem autopromoção explícita. Links no corpo são frequentemente contra as regras das comunidades.',
  },
  blog: {
    maxChars: 5000,
    supportsLinks: true,
    supportsImages: true,
    tone: 'educativo, com profundidade',
    notes: 'SEO importa: título, subtítulos e densidade de termos relevantes.',
  },
  newsletter: {
    maxChars: 2000,
    supportsLinks: true,
    supportsImages: false,
    tone: 'pessoal e direto, como uma mensagem de um colega',
    notes: 'Assunto do e-mail não está aqui — é o hook. CTA claro no final.',
  },
}

// --- Risk Review --------------------------------------------------------

export const riskReviewSchema = z.object({
  verdict: z.enum(['pass', 'flag', 'block']),
  reasons: z.array(z.string()),
  suggestedFix: z.string().optional(),
})

export type RiskReview = z.infer<typeof riskReviewSchema>

// --- Deduplicação -------------------------------------------------------

export type DedupeVerdict =
  | { verdict: 'ok' }
  | { verdict: 'duplicate'; existingId: string; normalizedText: string }
  | { verdict: 'near_duplicate'; existingId: string; normalizedText: string; similarity: number }
