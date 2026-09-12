import { PageLoading } from '../../_components/page-loading'

/**
 * Fica na mesma pasta do layout do produto — o Suspense que o Next cria a partir daqui envolve só
 * o `{children}` (a página), então a sidebar permanece visível e interativa durante a troca de aba
 * e durante a navegação inicial pra dentro de um produto.
 */
export default function Loading() {
  return <PageLoading />
}
