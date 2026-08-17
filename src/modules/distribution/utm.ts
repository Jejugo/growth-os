/**
 * Gera parâmetros UTM para links publicados.
 * A tabela tracking_links e o ref= interno chegam na Fase 3.
 */
export function applyUtm(
  url: string,
  params: {
    channel: string
    campaignId: string
    postId: string
  },
): string {
  try {
    const parsed = new URL(url)
    parsed.searchParams.set('utm_source', params.channel)
    parsed.searchParams.set('utm_medium', 'social')
    parsed.searchParams.set('utm_campaign', params.campaignId)
    // Truncado para não exceder limites de grafemas — post ID sem prefixo
    parsed.searchParams.set('utm_content', params.postId.replace(/^[a-z]+_/, '').slice(0, 16))
    return parsed.toString()
  } catch {
    return url
  }
}

/**
 * Retorna uma string legível com todos os 4 parâmetros UTM, para validação.
 */
export function extractUtmParams(url: string): Record<string, string | null> {
  try {
    const parsed = new URL(url)
    return {
      utm_source: parsed.searchParams.get('utm_source'),
      utm_medium: parsed.searchParams.get('utm_medium'),
      utm_campaign: parsed.searchParams.get('utm_campaign'),
      utm_content: parsed.searchParams.get('utm_content'),
    }
  } catch {
    return { utm_source: null, utm_medium: null, utm_campaign: null, utm_content: null }
  }
}
