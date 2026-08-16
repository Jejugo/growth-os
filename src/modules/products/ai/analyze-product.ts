import { ai } from '@/modules/ai'
import type { CrawledPage } from '../crawler'
import {
  productFactsSchema,
  productPositioningSchema,
  type ProductFacts,
  type ProductPositioning,
} from '../types'

export const EXTRACT_PROMPT_VERSION = 'product.analyze.extract@1'
export const POSITIONING_PROMPT_VERSION = 'product.analyze.positioning@1'

function renderPages(pages: CrawledPage[]): string {
  return pages
    .map(
      (p) =>
        `<pagina papel="${p.pageRole}" url="${p.pageUrl}">\n` +
        `<titulo>${p.title ?? ''}</titulo>\n${p.extractedText}\n</pagina>`,
    )
    .join('\n\n')
}

// --- Passo 1: extração factual -------------------------------------------

const EXTRACT_SYSTEM = `Você extrai fatos literais do site de um produto SaaS.

Regras:
- Registre apenas o que está escrito no texto fornecido. Não infira, não complete, não estime.
- Preços: copie os valores como aparecem, com moeda e periodicidade. Se o site não mostra preço, use null e deixe a lista de planos vazia.
- Se um campo não aparece no texto, use null (para textos) ou lista vazia (para listas). Nunca invente um valor plausível.
- Funcionalidades: copie os itens listados pelo site, não os reescreva em outras palavras.
- Prova social: nomes de clientes, números de usuários e prêmios citados explicitamente.`

export async function extractProductFacts(input: {
  productId: string
  pages: CrawledPage[]
}): Promise<{ facts: ProductFacts; callId: string; costUsd: number }> {
  const result = await ai().generateStructured({
    task: 'product.analyze.extract',
    promptVersion: EXTRACT_PROMPT_VERSION,
    tier: 'cheap',
    schema: productFactsSchema,
    system: EXTRACT_SYSTEM,
    prompt: `Extraia os fatos do site abaixo.\n\n${renderPages(input.pages)}`,
    context: { productId: input.productId },
  })

  return { facts: result.data, callId: result.callId, costUsd: result.costUsd }
}

// --- Passo 2: inferência de posicionamento -------------------------------

const POSITIONING_SYSTEM = `Você é analista de posicionamento de produtos SaaS. A partir de fatos já extraídos de um site, infere o posicionamento comercial.

O que você produz alimenta uma estratégia de conteúdo, então precisa ser específico o bastante para alguém escrever um post a partir dele.

Regras:
- Trabalhe apenas com os fatos fornecidos. Você não tem acesso ao site.
- "Problema principal" é a dor de quem compra, escrita na linguagem dessa pessoa — não uma descrição do produto.
- "Usuários-alvo" são cargos, senioridades e contextos concretos (ex.: "engenheiro backend sênior na América Latina buscando trabalho remoto"), nunca rótulos genéricos como "empresas" ou "profissionais".
- "Diferenciais" só valem se sustentados pelos fatos. Se o site não sustenta nenhum, devolva lista vazia.
- "Concorrentes" apenas quando citados nos fatos ou quando forem óbvios na categoria. Na dúvida, lista vazia.
- "Objeções" são os motivos reais pelos quais alguém no perfil-alvo não compraria.
- "Temas de conteúdo" são assuntos sobre os quais este produto tem autoridade para falar.
- Confiança: número entre 0 e 1 por campo. Seja honesto — 0,3 quando o site dá pouca informação é mais útil do que 0,9 otimista.`

export async function inferPositioning(input: {
  productId: string
  url: string
  facts: ProductFacts
  pageRoles: string[]
}): Promise<{ positioning: ProductPositioning; callId: string; costUsd: number }> {
  const result = await ai().generateStructured({
    task: 'product.analyze.positioning',
    promptVersion: POSITIONING_PROMPT_VERSION,
    tier: 'strong',
    schema: productPositioningSchema,
    system: POSITIONING_SYSTEM,
    prompt:
      `Site: ${input.url}\n` +
      `Páginas lidas: ${input.pageRoles.join(', ')}\n\n` +
      `<fatos_extraidos>\n${JSON.stringify(input.facts, null, 2)}\n</fatos_extraidos>\n\n` +
      `Infira o posicionamento comercial deste produto.`,
    context: { productId: input.productId },
    // A verificação factual: o schema garante o formato, isto garante que o
    // modelo não inventou preço nem devolveu placeholder.
    verify: (data) => {
      const issues: string[] = []

      if (data.primaryProblem.trim().length < 20) {
        issues.push('primaryProblem está curto demais para ser acionável.')
      }
      if (data.targetUsers.length === 0) {
        issues.push('targetUsers não pode ser vazio — descreva ao menos um perfil concreto.')
      }
      if (data.targetUsers.some((u) => u.trim().split(/\s+/).length < 2)) {
        issues.push('Há usuário-alvo genérico de uma palavra; descreva cargo e contexto.')
      }

      // Se o site não informa preço, o posicionamento não pode citar valores.
      if (!input.facts.pricingSummary && input.facts.pricingTiers.length === 0) {
        const priceLike = /(R\$|US\$|\$|€)\s?\d|\b\d+\s?(reais|d[oó]lares|usd|brl)\b/i
        const textFields = [data.oneLiner, data.valueProposition, ...data.differentiators]
        if (textFields.some((t) => priceLike.test(t))) {
          issues.push('O site não informa preços, então nenhum campo pode citar valores.')
        }
      }

      const scores = Object.entries(data.confidence)
      const invalid = scores.filter(([, v]) => !(v >= 0 && v <= 1))
      if (invalid.length > 0) {
        issues.push(`Confiança fora do intervalo 0–1: ${invalid.map(([k]) => k).join(', ')}.`)
      }

      return issues
    },
  })

  return { positioning: result.data, callId: result.callId, costUsd: result.costUsd }
}
