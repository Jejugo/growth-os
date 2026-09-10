import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import { parseCustomLandingZip, CustomLandingUploadError } from '@/modules/validation/landing/custom-upload'

async function zipOf(entries: Record<string, string>): Promise<Buffer> {
  const zip = new JSZip()
  for (const [path, content] of Object.entries(entries)) zip.file(path, content)
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } })
}

describe('parseCustomLandingZip', () => {
  it('aceita um zip válido com index.html na raiz', async () => {
    const buffer = await zipOf({
      'index.html': '<html></html>',
      'style.css': 'body {}',
      'script.js': 'console.log(1)',
    })

    const files = await parseCustomLandingZip(buffer)

    expect(files).toHaveLength(3)
    expect(files.map((f) => f.file).sort()).toEqual(['index.html', 'script.js', 'style.css'])
  })

  it('remove a pasta comum quando tudo está dentro de uma única pasta-wrapper', async () => {
    const buffer = await zipOf({
      'meu-projeto/index.html': '<html></html>',
      'meu-projeto/style.css': 'body {}',
    })

    const files = await parseCustomLandingZip(buffer)

    expect(files.map((f) => f.file).sort()).toEqual(['index.html', 'style.css'])
  })

  it('ignora __MACOSX/ e .DS_Store', async () => {
    const buffer = await zipOf({
      'index.html': '<html></html>',
      '__MACOSX/._index.html': 'lixo',
      '.DS_Store': 'lixo',
    })

    const files = await parseCustomLandingZip(buffer)

    expect(files.map((f) => f.file)).toEqual(['index.html'])
  })

  it('rejeita zip sem index.html', async () => {
    const buffer = await zipOf({ 'style.css': 'body {}' })

    await expect(parseCustomLandingZip(buffer)).rejects.toThrow(CustomLandingUploadError)
  })

  it('rejeita zip vazio', async () => {
    const buffer = await zipOf({})

    await expect(parseCustomLandingZip(buffer)).rejects.toThrow(CustomLandingUploadError)
  })

  it('rejeita extensão não permitida', async () => {
    const buffer = await zipOf({
      'index.html': '<html></html>',
      'logo.png': 'binário fingido de texto',
    })

    await expect(parseCustomLandingZip(buffer)).rejects.toThrow(/não suportado/)
  })

  it('rejeita caminho absoluto', async () => {
    // JSZip normaliza ".." na própria API de escrita (não dá pra fabricar essa entrada por aqui),
    // mas preserva caminho absoluto como está — o suficiente pra exercitar o guard de segurança.
    const buffer = await zipOf({
      'index.html': '<html></html>',
      '/etc/passwd.txt': 'alert(1)',
    })

    await expect(parseCustomLandingZip(buffer)).rejects.toThrow(/não permitido/)
  })

  it('rejeita zip maior que o limite de tamanho', async () => {
    const oversized = Buffer.alloc(6 * 1024 * 1024)

    await expect(parseCustomLandingZip(oversized)).rejects.toThrow(/excede o limite/)
  })

  it('rejeita conteúdo descomprimido acima do limite (proteção contra zip bomb)', async () => {
    const huge = 'a'.repeat(11 * 1024 * 1024)
    const buffer = await zipOf({ 'index.html': huge })

    await expect(parseCustomLandingZip(buffer)).rejects.toThrow(/descomprimido excede/)
  })

  it('rejeita mais arquivos que o limite', async () => {
    const entries: Record<string, string> = { 'index.html': '<html></html>' }
    for (let i = 0; i < 101; i++) entries[`file-${i}.js`] = '// x'

    const buffer = await zipOf(entries)

    await expect(parseCustomLandingZip(buffer)).rejects.toThrow(/mais de \d+ arquivos/)
  })
})
