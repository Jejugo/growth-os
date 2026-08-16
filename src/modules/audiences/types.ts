import { z } from 'zod'

// --- Saída da IA para derivação de segmentos ----------------------------

export const derivedSegmentSchema = z.object({
  name: z.string(),
  description: z.string(),
  locations: z.array(z.string()),
  professions: z.array(z.string()),
  seniority: z.array(z.string()),
  interests: z.array(z.string()),
  painPoints: z.array(z.string()),
  keywords: z.array(z.string()),
  audienceFitScore: z.number().int(),
  problemIntensityScore: z.number().int(),
  conversionPotentialScore: z.number().int(),
  rationale: z.string(),
})

export const deriveSegmentsOutputSchema = z.object({
  segments: z.array(derivedSegmentSchema),
})

export type DerivedSegment = z.infer<typeof derivedSegmentSchema>
export type DeriveSegmentsOutput = z.infer<typeof deriveSegmentsOutputSchema>
