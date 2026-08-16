import { z } from 'zod'

// --- Saída da IA para planejamento de campanha ---------------------------

export const plannedThemeSchema = z.object({
  name: z.string(),
  description: z.string(),
  keywords: z.array(z.string()),
})

export const planCampaignOutputSchema = z.object({
  name: z.string(),
  bigIdea: z.string(),
  // "Se X para Y, então Z porque W"
  hypothesis: z.string(),
  themes: z.array(plannedThemeSchema),
})

export type PlannedTheme = z.infer<typeof plannedThemeSchema>
export type PlanCampaignOutput = z.infer<typeof planCampaignOutputSchema>

// --- Saída da IA para geração de ideia por ângulo -----------------------

export const generatedIdeaSchema = z.object({
  title: z.string(),
  summary: z.string(),
  supportingFacts: z.array(z.string()).nullable(),
})

export type GeneratedIdea = z.infer<typeof generatedIdeaSchema>
