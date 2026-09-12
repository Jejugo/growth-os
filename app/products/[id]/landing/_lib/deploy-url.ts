/**
 * A Vercel devolve (e a gente guarda em `deployUrl`) a URL específica do deployment — carrega um
 * hash e o nome do time/conta, ex. "meu-slug-x7f3ab-time.vercel.app". Só isso já é público e
 * funciona, mas o alias "limpo" do projeto (sempre "{slug}.vercel.app", sem hash nem nome de
 * ninguém) é o que faz sentido mostrar na tela — é estável e não expõe o nome da conta.
 *
 * `slug` já é o nome do projeto na Vercel (`deployLandingFiles` usa exatamente esse valor como
 * `projectName`), então dá pra construir o alias limpo direto, sem outra chamada à API — funciona
 * inclusive pra landings publicadas antes desta mudança, cujo `deployUrl` salvo é o comprido.
 */
export function shortDeployUrl(landingPage: { slug: string; deployUrl: string | null }): string | null {
  if (!landingPage.deployUrl) return null
  return `https://${landingPage.slug}.vercel.app`
}
