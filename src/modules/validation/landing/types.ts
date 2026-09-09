import { z } from 'zod'

export const landingPageCopySchema = z.object({
  headline: z.string(),
  subheadline: z.string(),
  benefits: z
    .array(z.object({ title: z.string(), description: z.string() }))
    .min(3)
    .max(6),
  // null quando o perfil não tem prova social real — nunca inventar.
  socialProofLine: z.string().nullable(),
  ctaText: z.string(),
  ctaMicrocopy: z.string().nullable(),
})

export type LandingPageCopy = z.infer<typeof landingPageCopySchema>
