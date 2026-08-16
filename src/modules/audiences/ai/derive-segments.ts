import { ai } from '@/modules/ai'
import { deriveSegmentsOutputSchema, type DerivedSegment } from '../types'
import type { ProductProfile } from '@/modules/products/schema'

export const PROMPT_VERSION = 'audiences.derive-segments@1'

const SYSTEM = `Você analisa perfis de produtos SaaS e identifica segmentos de audiência com alto potencial.

Cada segmento deve ser suficientemente específico para guiar a criação de conteúdo direcionado.

Regras:
- Gere entre 3 e 5 segmentos distintos por produto.
- Nome do segmento: curto, descritivo (ex.: "Founder técnico de startup B2B").
- Descrição: uma frase explicando quem é essa pessoa e por que compraria.
- Profissões e senioridade: concretos, não genéricos ("CEO" sem contexto não serve).
- painPoints: os 2–4 problemas reais que fazem essa pessoa procurar uma solução.
- Scores (0–100): estime com honestidade — prefira subestimar a inflar.
  * audienceFitScore: o quanto o produto resolve problemas desta audiência.
  * problemIntensityScore: o quanto esse problema dói para a pessoa.
  * conversionPotentialScore: probabilidade de compra, dado o fit.
- rationale: explique brevemente por que este segmento faz sentido para o produto.
- Evite segmentos sobrepostos: cada um deve representar uma persona distinta.`

export async function deriveAudienceSegments(input: {
  productId: string
  profile: ProductProfile
}): Promise<{ segments: DerivedSegment[]; callId: string; costUsd: number }> {
  const { profile } = input

  const profileSummary = [
    `Produto: ${profile.productName ?? 'desconhecido'}`,
    `Uma linha: ${profile.oneLiner ?? 'não informado'}`,
    `Problema principal: ${profile.primaryProblem ?? 'não informado'}`,
    `Proposta de valor: ${profile.valueProposition ?? 'não informado'}`,
    `Usuários-alvo (do perfil): ${profile.data.targetUsers.join(', ') || 'não informado'}`,
    `Casos de uso: ${profile.data.useCases.join(', ') || 'não informado'}`,
    `Diferenciais: ${profile.data.differentiators.join(', ') || 'não informado'}`,
    `Objeções conhecidas: ${profile.data.objections.join(', ') || 'nenhuma'}`,
    `Setores: ${profile.data.industries.join(', ') || 'não informado'}`,
  ].join('\n')

  const result = await ai().generateStructured({
    task: 'audiences.derive-segments',
    promptVersion: PROMPT_VERSION,
    tier: 'strong',
    schema: deriveSegmentsOutputSchema,
    system: SYSTEM,
    prompt: `A partir do perfil abaixo, identifique os segmentos de audiência com maior potencial para este produto.\n\n${profileSummary}`,
    context: { productId: input.productId },
    verify: (data) => {
      const issues: string[] = []

      if (data.segments.length < 3) {
        issues.push('São necessários ao menos 3 segmentos.')
      }
      if (data.segments.length > 5) {
        issues.push('Máximo de 5 segmentos.')
      }

      for (const s of data.segments) {
        if (s.painPoints.length === 0) {
          issues.push(`Segmento "${s.name}" não tem painPoints.`)
        }
        for (const score of [s.audienceFitScore, s.problemIntensityScore, s.conversionPotentialScore]) {
          if (score < 0 || score > 100) {
            issues.push(`Segmento "${s.name}": scores devem ser 0–100.`)
            break
          }
        }
      }

      return issues
    },
  })

  return { segments: result.data.segments, callId: result.callId, costUsd: result.costUsd }
}
