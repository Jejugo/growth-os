import { createDeployment, waitForDeploymentReady, disableDeploymentProtection } from './vercel-client'

export class LandingDeployError extends Error {}

/**
 * `slug` precisa ser estável por produto (não aleatório a cada chamada) — a
 * Vercel associa o domínio `.vercel.app` ao nome do projeto, então reusar o
 * mesmo nome em regenerações atualiza o mesmo domínio em vez de criar um
 * novo. Trocar de domínio no meio de uma validação já iniciada quebraria
 * `products.domain` (único) e os posts/tracking links já publicados.
 */
export async function deployLandingPage(
  html: string,
  slug: string,
): Promise<{ url: string; deploymentId: string }> {
  let created
  try {
    created = await createDeployment({
      projectName: slug,
      files: [{ file: 'index.html', data: html }],
    })
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
    return { url: `https://${ready.url}`, deploymentId: created.id }
  } catch (error) {
    throw new LandingDeployError(
      error instanceof Error ? error.message : 'Deployment não ficou pronto a tempo.',
    )
  }
}
