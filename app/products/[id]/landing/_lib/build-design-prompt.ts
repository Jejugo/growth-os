import type { ProductBrief } from '@/modules/validation'
import type { ProductProfile } from '@/modules/products'
import type { LandingPageCopy } from '@/modules/validation/landing/types'

/** Uma linha da checklist de seções — declara sim/não sempre, nunca omite em silêncio. */
function checklistItem(header: string, items: string[], label: { yes: string; no: string }): string[] {
  if (items.length === 0) return ['', `${header} — ${label.no}`]
  return ['', `${header} — ${label.yes}`, ...items.map((item) => `   - ${item}`)]
}

/**
 * Monta um prompt descritivo pra colar numa ferramenta de design externa (Claude Design, Google
 * Stitch, v0, ...) — puramente determinístico a partir de dado já existente (brief/perfil/copy),
 * sem chamada de IA. O usuário ajusta/completa manualmente antes de colar.
 *
 * A checklist de seções declara sim/não pra cada uma sempre, mesmo quando a resposta é "não" —
 * silêncio deixa a ferramenta externa livre pra inventar prova social, preço ou FAQ que não
 * existem de verdade.
 */
export function buildExternalDesignPrompt({
  productName,
  brief,
  profile,
  copy,
}: {
  productName: string
  brief: ProductBrief | null
  profile: ProductProfile | null
  copy: LandingPageCopy | null
}): string {
  const lines: string[] = [
    'Crie o design de uma landing page de captura de e-mail (lista de espera) para o produto abaixo.',
    '',
    // Nome real cadastrado pelo usuário — nunca o `profile.productName`, que para ideias é um
    // nome comercial inferido pela IA a partir só do brief (nunca vê o nome real digitado) e
    // pode divergir dele.
    `Produto: ${productName}`,
  ]

  if (profile?.oneLiner) lines.push(`Em uma frase: ${profile.oneLiner}`)

  const problem = profile?.primaryProblem || brief?.problem
  if (problem) lines.push(`Problema que resolve: ${problem}`)

  const audience = profile?.data.targetUsers.length ? profile.data.targetUsers.join(', ') : brief?.audience
  if (audience) lines.push(`Para quem: ${audience}`)

  const valueProp = profile?.valueProposition || brief?.solutionSketch
  if (valueProp) lines.push(`Proposta de valor: ${valueProp}`)

  if (copy) {
    lines.push('', 'Copy já escrita — use como base ou melhore:')
    lines.push(`Headline: ${copy.headline}`)
    lines.push(`Subheadline: ${copy.subheadline}`)
    if (copy.benefits.length) {
      lines.push('Benefícios:')
      for (const b of copy.benefits) lines.push(`- ${b.title}: ${b.description}`)
    }
    lines.push(`CTA: ${copy.ctaText}`)
    if (copy.ctaMicrocopy) lines.push(`Microcopy do CTA: ${copy.ctaMicrocopy}`)
  }

  const differentiators = profile?.data.differentiators ?? []
  const useCases = profile?.data.useCases ?? []
  const socialProof = [...(profile?.data.socialProof ?? []), ...(copy?.socialProofLine ? [copy.socialProofLine] : [])]
  const objections = profile?.data.objections ?? []
  const pricingTiers = profile?.data.pricingTiers ?? []

  lines.push(
    '',
    'Checklist de seções — siga exatamente isto, não adicione nem invente seção ou dado que não',
    'esteja listado aqui:',
    '',
    '1. Hero — obrigatório. Headline, subheadline e o formulário de e-mail com botão de CTA.',
    '',
    '2. Formulário — obrigatório. Campo único: e-mail. O backend desta landing só aceita e-mail',
    '   (endpoint de signup da lista de espera) — não peça nome, empresa, telefone nem cargo,',
    '   esses dados não seriam salvos.',
  )

  lines.push(
    ...checklistItem('3. Benefícios/diferenciais', differentiators, {
      yes: 'sim, use estes:',
      no: 'não há diferenciais mapeados ainda — derive no máximo 3 direto da proposta de valor acima, sem inventar funcionalidade nova.',
    }),
    ...checklistItem('4. Casos de uso', useCases, {
      yes: 'sim, use estes:',
      no: 'opcional, omita se não couber bem no design.',
    }),
    ...checklistItem('5. Prova social', socialProof, {
      yes: 'sim, use isto:',
      no: 'não incluir — não há depoimento, logo de cliente nem número real disponível ainda. Não invente.',
    }),
    ...checklistItem('6. FAQ', objections, {
      yes: 'sim, responda estas objeções prováveis (uma pergunta por objeção):',
      no: 'opcional — não há objeções mapeadas ainda; pode omitir.',
    }),
    ...checklistItem(
      '7. Preços',
      pricingTiers.map((t) => `${t.name}: ${t.price}${t.notes ? ` — ${t.notes}` : ''}`),
      {
        yes: 'sim, referência (não precisa ser o foco da página):',
        no: 'não incluir — sem preço definido ainda (produto em validação).',
      },
    ),
  )

  lines.push(
    '',
    '8. Rodapé — obrigatório, simples (nome do produto e link de contato, se houver).',
    '',
    'Estilo: página única, moderna, limpa, mobile-first. Não é um site institucional completo —',
    'o único objetivo é converter em cadastro na lista de espera.',
  )

  return lines.join('\n')
}
