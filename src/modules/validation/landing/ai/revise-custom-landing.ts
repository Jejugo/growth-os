import { z } from 'zod'
import { ai } from '@/modules/ai'
import type { CustomLandingFile, CustomLandingDraftHistoryEntry } from '../types'

export const PROMPT_VERSION = 'validation.revise-custom-landing@3'

/**
 * Cota generosa de ENTRADA — sites reais exportados de ferramenta de design (CSS/JS inline)
 * facilmente passam de 50-100KB. Isso não empurra contra o teto de saída do modelo (16384 tokens,
 * ver `MODELS.standard.maxTokens` em `ai/config.ts`) porque a IA só devolve os arquivos que de fato
 * mudou (ver `SYSTEM`/merge abaixo) — o resto vem do upload original sem reescrever um byte.
 */
export const MAX_REVISABLE_BYTES = 300 * 1024

export class CustomLandingTooLargeError extends Error {}

/** Checagem síncrona e barata — chamada pelo dispatcher ANTES de criar qualquer linha nova. */
export function assertRevisable(files: CustomLandingFile[]): void {
  const totalBytes = files.reduce((sum, f) => sum + Buffer.byteLength(f.data, 'utf8'), 0)
  if (totalBytes > MAX_REVISABLE_BYTES) {
    throw new CustomLandingTooLargeError(
      `Esta landing tem ${(totalBytes / 1024).toFixed(0)}KB de código — acima do limite de ` +
        `${MAX_REVISABLE_BYTES / 1024}KB pra pedir ajuste por IA. Peça o ajuste direto na ferramenta ` +
        `que desenhou a página e reenvie o zip.`,
    )
  }
}

const SYSTEM = `Você edita o código-fonte (HTML/CSS/JS) de uma landing page de teste de demanda que o próprio fundador desenhou numa ferramenta externa (ex.: Claude Design, v0, Stitch) e enviou pra este sistema via upload de zip. Isto é um rascunho em iteração — o fundador vai pedir vários ajustes em sequência antes de publicar, então trate cada pedido como parte de uma conversa contínua, não um pedido isolado.

Regras absolutas:
- Mude SÓ o que o pedido ATUAL pede. Preserve estrutura, estilo e conteúdo do resto exatamente como está — inclusive o que ajustes anteriores já corrigiram (não desfaça o histórico).
- Devolva APENAS os arquivos que você efetivamente alterou — nunca inclua de volta um arquivo que ficou idêntico ao original. Arquivos que você não incluir na resposta são mantidos exatamente como estavam.
- Nunca invente um nome de arquivo que não existia na lista original — não é permitido criar arquivo novo.
- Nunca invente prova social, número, ou funcionalidade que não estava no código original.
- Devolva o conteúdo COMPLETO de cada arquivo alterado — nunca um diff ou trecho parcial.`

const fileSchema = z.object({ file: z.string(), data: z.string() })
const resultSchema = z.object({ files: z.array(fileSchema).min(1) })

export async function reviseCustomLandingFiles(input: {
  productId: string
  files: CustomLandingFile[]
  note: string
  /** Pedidos anteriores desta mesma sessão de rascunho, em ordem — dá contexto do que já foi tentado. */
  history?: CustomLandingDraftHistoryEntry[]
}): Promise<{ files: CustomLandingFile[]; callId: string; costUsd: number }> {
  assertRevisable(input.files)

  const filesBlock = input.files
    .map((f) => `<arquivo nome="${f.file}">\n${f.data}\n</arquivo>`)
    .join('\n\n')

  const historyBlock =
    input.history && input.history.length > 0
      ? [
          '',
          '<pedidos_anteriores_nesta_sessao>',
          ...input.history.map((h, i) => `${i + 1}. ${h.note}`),
          '</pedidos_anteriores_nesta_sessao>',
        ].join('\n')
      : ''

  const originalNames = new Set(input.files.map((f) => f.file))

  const result = await ai().generateStructured({
    task: 'validation.revise-custom-landing',
    promptVersion: PROMPT_VERSION,
    tier: 'standard',
    schema: resultSchema,
    system: SYSTEM,
    prompt: [
      '<arquivos_atuais>',
      filesBlock,
      '</arquivos_atuais>',
      historyBlock,
      '',
      '<pedido_atual>',
      input.note,
      '</pedido_atual>',
      '',
      'Devolva só os arquivos que você mudou (com o conteúdo completo de cada um) — nunca os que ficaram iguais.',
    ].join('\n'),
    context: { productId: input.productId },
    verify: (data) => {
      const issues: string[] = []
      const unknown = data.files.filter((f) => !originalNames.has(f.file))
      if (unknown.length > 0) {
        issues.push(
          `Arquivo(s) inexistente(s) no upload original: ${unknown.map((f) => f.file).join(', ')} — não é ` +
            'permitido criar arquivo novo.',
        )
      }
      return issues
    },
  })

  // Mescla: só os arquivos que a IA de fato devolveu são substituídos; o resto vem inalterado do
  // upload original. É assim que a saída cabe no orçamento do modelo mesmo em sites grandes — o
  // modelo nunca precisa "pagar" tokens de saída reescrevendo o que já estava certo.
  const revisedByName = new Map(result.data.files.map((f) => [f.file, f.data]))
  const files = input.files.map((f) => ({ file: f.file, data: revisedByName.get(f.file) ?? f.data }))

  return { files, callId: result.callId, costUsd: result.costUsd }
}
