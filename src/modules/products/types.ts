import { z } from 'zod'

/**
 * Schemas dos dois passos de análise. Separados de propósito (roadmap §
 * Fase 0): o passo 1 é barato e cacheável por contentHash; o passo 2 só vê
 * fatos já extraídos, então não inventa preço.
 *
 * Os schemas evitam restrições numéricas e de tamanho — structured outputs
 * não as suporta, e deixá-las de fora poupa retries desnecessários.
 */

// --- Passo 1: extração factual (tier cheap) ------------------------------

export const pricingTierSchema = z.object({
  name: z.string(),
  price: z.string(),
  notes: z.string().nullable(),
})

export const productFactsSchema = z.object({
  productName: z.string().nullable(),
  tagline: z.string().nullable(),
  pricingSummary: z.string().nullable(),
  pricingTiers: z.array(pricingTierSchema),
  ctas: z.array(z.string()),
  featuresListed: z.array(z.string()),
  integrationsMentioned: z.array(z.string()),
  socialProof: z.array(z.string()),
})

export type ProductFacts = z.infer<typeof productFactsSchema>

// --- Passo 2: inferência de posicionamento (tier strong) -----------------

export const confidenceSchema = z.object({
  primaryProblem: z.number(),
  targetUsers: z.number(),
  valueProposition: z.number(),
  differentiators: z.number(),
  competitors: z.number(),
})

export const productPositioningSchema = z.object({
  oneLiner: z.string(),
  primaryProblem: z.string(),
  valueProposition: z.string(),
  targetUsers: z.array(z.string()),
  industries: z.array(z.string()),
  useCases: z.array(z.string()),
  differentiators: z.array(z.string()),
  competitors: z.array(z.string()),
  keywords: z.array(z.string()),
  objections: z.array(z.string()),
  contentThemes: z.array(z.string()),
  confidence: confidenceSchema,
})

export type ProductPositioning = z.infer<typeof productPositioningSchema>

// --- Perfil consolidado --------------------------------------------------

/** Parte do perfil que vive em JSONB — validada na borda, sempre. */
export const profileDataSchema = z.object({
  tagline: z.string().nullable(),
  targetUsers: z.array(z.string()),
  industries: z.array(z.string()),
  useCases: z.array(z.string()),
  differentiators: z.array(z.string()),
  ctas: z.array(z.string()),
  competitors: z.array(z.string()),
  keywords: z.array(z.string()),
  objections: z.array(z.string()),
  contentThemes: z.array(z.string()),
  pricingTiers: z.array(pricingTierSchema),
  featuresListed: z.array(z.string()),
  integrationsMentioned: z.array(z.string()),
  socialProof: z.array(z.string()),
})

export type ProfileData = z.infer<typeof profileDataSchema>

/** Campos-chave promovidos a coluna: consultáveis e usados em prompts. */
export const COLUMN_FIELDS = [
  'productName',
  'oneLiner',
  'primaryProblem',
  'valueProposition',
  'pricingSummary',
] as const

export type ColumnField = (typeof COLUMN_FIELDS)[number]

export const DATA_FIELDS = Object.keys(profileDataSchema.shape) as Array<keyof ProfileData>

/** Namespace plano de campos editáveis — é o que `lockedFields` referencia. */
export const EDITABLE_FIELDS = [...COLUMN_FIELDS, ...DATA_FIELDS] as const
export type EditableField = ColumnField | keyof ProfileData

export function isEditableField(value: string): value is EditableField {
  return (EDITABLE_FIELDS as readonly string[]).includes(value)
}

/** Rótulos em pt-BR para a UI. */
export const FIELD_LABELS: Record<EditableField, string> = {
  productName: 'Nome do produto',
  oneLiner: 'Descrição em uma linha',
  primaryProblem: 'Problema principal',
  valueProposition: 'Proposta de valor',
  pricingSummary: 'Resumo de preços',
  tagline: 'Tagline',
  targetUsers: 'Usuários-alvo',
  industries: 'Setores',
  useCases: 'Casos de uso',
  differentiators: 'Diferenciais',
  ctas: 'Chamadas para ação',
  competitors: 'Concorrentes',
  keywords: 'Palavras-chave',
  objections: 'Objeções prováveis',
  contentThemes: 'Temas de conteúdo',
  pricingTiers: 'Planos',
  featuresListed: 'Funcionalidades listadas',
  integrationsMentioned: 'Integrações citadas',
  socialProof: 'Prova social',
}
