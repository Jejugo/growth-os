import JSZip from 'jszip'

export class CustomLandingUploadError extends Error {}

const MAX_ZIP_BYTES = 5 * 1024 * 1024
const MAX_UNCOMPRESSED_BYTES = 10 * 1024 * 1024
const MAX_FILES = 100

const ALLOWED_EXTENSIONS = new Set(['.html', '.htm', '.css', '.js', '.mjs', '.json', '.svg', '.txt'])

function extensionOf(path: string): string {
  const dot = path.lastIndexOf('.')
  return dot === -1 ? '' : path.slice(dot).toLowerCase()
}

function isJunkPath(path: string): boolean {
  return path.startsWith('__MACOSX/') || path.split('/').pop() === '.DS_Store'
}

function isUnsafePath(path: string): boolean {
  return path.startsWith('/') || path.split('/').some((segment) => segment === '..')
}

/**
 * Ferramentas de design costumam exportar tudo dentro de uma única pasta (ex.:
 * "meu-projeto/index.html"). Se todas as entradas compartilham o mesmo primeiro segmento, ele é
 * removido antes de validar — assim o zip não precisa vir "achatado" na raiz.
 */
function commonRootPrefix(paths: string[]): string {
  // só conta como "pasta comum" se TODA entrada estiver de fato aninhada (tem "/") — senão um
  // único arquivo solto na raiz (sem "/") teria o próprio nome tratado como pasta e removido.
  if (paths.length === 0 || !paths.every((p) => p.includes('/'))) return ''
  const [first, ...rest] = paths.map((p) => p.split('/')[0])
  return first && rest.every((segment) => segment === first) ? `${first}/` : ''
}

/**
 * Valida e extrai um zip de landing page customizada (HTML/CSS/JS) pra um array de arquivos de
 * texto pronto pra `deployLandingFiles`. Pura — sem banco, sem rede — lança
 * `CustomLandingUploadError` com mensagem acionável em cada regra violada.
 */
export async function parseCustomLandingZip(buffer: Buffer): Promise<Array<{ file: string; data: string }>> {
  if (buffer.byteLength > MAX_ZIP_BYTES) {
    throw new CustomLandingUploadError(`O zip excede o limite de ${MAX_ZIP_BYTES / (1024 * 1024)}MB.`)
  }

  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(buffer)
  } catch {
    throw new CustomLandingUploadError('Não foi possível abrir o arquivo — confira se é um .zip válido.')
  }

  const entries = Object.values(zip.files).filter((entry) => !entry.dir && !isJunkPath(entry.name))
  if (entries.length === 0) {
    throw new CustomLandingUploadError('O zip está vazio.')
  }
  if (entries.length > MAX_FILES) {
    throw new CustomLandingUploadError(`O zip tem mais de ${MAX_FILES} arquivos.`)
  }

  const rootPrefix = commonRootPrefix(entries.map((entry) => entry.name))

  const files: Array<{ file: string; data: string }> = []
  let totalBytes = 0

  for (const entry of entries) {
    const relativePath = rootPrefix ? entry.name.slice(rootPrefix.length) : entry.name
    if (!relativePath) continue // era só a própria pasta-wrapper, sem conteúdo

    if (isUnsafePath(relativePath)) {
      throw new CustomLandingUploadError(`Caminho não permitido no zip: "${entry.name}".`)
    }

    const ext = extensionOf(relativePath)
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      throw new CustomLandingUploadError(
        `Tipo de arquivo não suportado: "${relativePath}". Aceitos nesta versão: ${[...ALLOWED_EXTENSIONS].join(', ')} (sem imagens ou fontes).`,
      )
    }

    const data = await entry.async('string')
    totalBytes += Buffer.byteLength(data, 'utf8')
    if (totalBytes > MAX_UNCOMPRESSED_BYTES) {
      throw new CustomLandingUploadError(
        `O conteúdo descomprimido excede ${MAX_UNCOMPRESSED_BYTES / (1024 * 1024)}MB.`,
      )
    }

    files.push({ file: relativePath, data })
  }

  if (!files.some((f) => f.file === 'index.html')) {
    throw new CustomLandingUploadError(
      'O zip precisa ter um arquivo "index.html" na raiz (ou dentro da única pasta, se tudo estiver dentro de uma).',
    )
  }

  return files
}
