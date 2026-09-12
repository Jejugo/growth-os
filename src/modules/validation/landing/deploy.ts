import {
  createDeployment,
  waitForDeploymentReady,
  disableDeploymentProtection,
  listDeploymentAliases,
} from './vercel-client'

export class LandingDeployError extends Error {}

/**
 * A Vercel devolve a URL específica do deployment (com hash e nome do time/conta, ex.
 * "slug-x7f3ab-time.vercel.app") — prefere o alias "limpo" do projeto (ex. "slug.vercel.app",
 * sempre o mais curto da lista) quando ele já estiver atribuído. Nunca deixa essa preferência
 * quebrar o deploy: se a consulta falhar ou não houver alias ainda, cai pra URL do deployment.
 */
async function preferredPublicUrl(deploymentUrl: string, deploymentId: string): Promise<string> {
  try {
    const aliases = await listDeploymentAliases(deploymentId)
    if (aliases.length === 0) return deploymentUrl
    return aliases.reduce((shortest, alias) => (alias.length < shortest.length ? alias : shortest))
  } catch {
    return deploymentUrl
  }
}

/**
 * `slug` precisa ser estável por produto (não aleatório a cada chamada) — a
 * Vercel associa o domínio `.vercel.app` ao nome do projeto, então reusar o
 * mesmo nome em regenerações atualiza o mesmo domínio em vez de criar um
 * novo. Trocar de domínio no meio de uma validação já iniciada quebraria
 * `products.domain` (único) e os posts/tracking links já publicados.
 */
export async function deployLandingFiles(
  files: Array<{ file: string; data: string }>,
  slug: string,
): Promise<{ url: string; deploymentId: string }> {
  let created
  try {
    created = await createDeployment({ projectName: slug, files })
  } catch (error) {
    throw new LandingDeployError(
      error instanceof Error ? error.message : 'Falha ao criar deployment na Vercel.',
    )
  }

  try {
    // A landing precisa ser pública — sem isso, o projeto novo nasce atrás
    // do login do Vercel e nenhum visitante real consegue ver a página.
    await disableDeploymentProtection(slug)
    const ready = await waitForDeploymentReady(created.id)
    const url = await preferredPublicUrl(ready.url, created.id)
    return { url: `https://${url}`, deploymentId: created.id }
  } catch (error) {
    throw new LandingDeployError(
      error instanceof Error ? error.message : 'Deployment não ficou pronto a tempo.',
    )
  }
}
