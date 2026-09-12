import { NextResponse } from 'next/server'
import { requireUser } from '@/server/guard'
import { findLandingPageDraft } from '@/modules/validation'

export const runtime = 'nodejs'

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
}

function contentTypeOf(path: string): string {
  const dot = path.lastIndexOf('.')
  const ext = dot === -1 ? '' : path.slice(dot).toLowerCase()
  return CONTENT_TYPES[ext] ?? 'text/plain; charset=utf-8'
}

/**
 * Next.js normaliza `/api/landing-drafts/{id}/` pra `/api/landing-drafts/{id}` (sem barra final,
 * 308) — sem essa `<base>`, um `<link href="style.css">` relativo resolveria contra a URL sem o
 * `{id}` no final e quebraria. Injeta logo após `<head>` (ou no início do documento, na falta dele).
 */
function withBaseHref(html: string, base: string): string {
  const headMatch = html.match(/<head[^>]*>/i)
  const tag = `<base href="${base}">`
  if (headMatch) {
    const index = headMatch.index! + headMatch[0].length
    return html.slice(0, index) + tag + html.slice(index)
  }
  return tag + html
}

/**
 * Serve o rascunho de landing customizada direto do banco (sem deploy na Vercel) pro `<iframe>` de
 * preview — é assim que "pedir ajustes" mostra resultado na hora, sem esperar deploy nenhum.
 * Autenticado (não é a landing pública) — mesma sessão do app, o `<iframe>` same-origin já manda o
 * cookie.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ productId: string; path?: string[] }> },
) {
  await requireUser()
  const { productId, path } = await params

  const draft = await findLandingPageDraft(productId)
  if (!draft) return new NextResponse('Nenhum rascunho de landing pra este produto.', { status: 404 })

  const isIndex = !path || path.length === 0
  const targetName = isIndex ? 'index.html' : path.join('/')
  const file = draft.files.find((f) => f.file === targetName)
  if (!file) return new NextResponse(`Arquivo não encontrado no rascunho: ${targetName}`, { status: 404 })

  const data = isIndex ? withBaseHref(file.data, `/api/landing-drafts/${productId}/`) : file.data

  return new NextResponse(data, {
    headers: {
      'Content-Type': contentTypeOf(file.file),
      'Cache-Control': 'no-store',
    },
  })
}
