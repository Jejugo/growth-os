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

/** Um arquivo de texto (HTML/CSS/JS/...) de um upload de landing customizada. */
export interface CustomLandingFile {
  file: string
  data: string
}

/** Um pedido de ajuste no rascunho — a IA vê o histórico inteiro, não só o pedido mais recente. */
export interface CustomLandingDraftHistoryEntry {
  note: string
  createdAt: string
}
