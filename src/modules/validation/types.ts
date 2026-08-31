import { z } from 'zod'

// --- Brief ------------------------------------------------------------------

export const briefInputSchema = z.object({
  problem: z.string().min(1),
  audience: z.string().min(1),
  solutionSketch: z.string().min(1),
  whyNow: z.string().nullable(),
  alternatives: z.string().nullable(),
  riskiestAssumption: z.string().min(1),
})

export type BriefInput = z.infer<typeof briefInputSchema>

// --- Posicionamento a partir do brief (IA, tier strong) ---------------------
// Mesmo formato de saída do passo 2 da análise de produto (fase 0), mas
// alimentado pelo brief em vez de fatos extraídos de crawl.

export const briefPositioningSchema = z.object({
  productName: z.string(),
  oneLiner: z.string(),
  primaryProblem: z.string(),
  valueProposition: z.string(),
  pricingSummary: z.string().nullable(),
  targetUsers: z.array(z.string()),
  industries: z.array(z.string()),
  useCases: z.array(z.string()),
  differentiators: z.array(z.string()),
  competitors: z.array(z.string()),
  keywords: z.array(z.string()),
  objections: z.array(z.string()),
  contentThemes: z.array(z.string()),
})

export type BriefPositioning = z.infer<typeof briefPositioningSchema>

// --- Ângulos de posicionamento (variantes do experimento) -------------------

export const positioningVariantSchema = z.object({
  name: z.string(), // curto — vira o nome da variante e o título da "ideia"
  description: z.string(), // vira o resumo da "ideia" e a base do post
  positioningAngle: z.string(), // instrução de enquadramento para o redator
})

export const angleVariantsSchema = z.object({
  variants: z.array(positioningVariantSchema).min(2).max(3),
})

export type PositioningVariant = z.infer<typeof positioningVariantSchema>
export type AngleVariants = z.infer<typeof angleVariantsSchema>

// --- Veredito (redação, não decisão — o cálculo é determinístico) -----------

export const verdictWriteupSchema = z.object({
  verdictReason: z.string(),
  pivotSuggestions: z.array(z.string()),
})

export type VerdictWriteup = z.infer<typeof verdictWriteupSchema>
