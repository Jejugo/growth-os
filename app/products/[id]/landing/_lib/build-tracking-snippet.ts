/**
 * Landing customizada (zip de ferramenta externa) não passa pelo `template.ts` do GrowthOS, então
 * o formulário de e-mail dela não tem como saber chamar `/api/lp/[productId]/signup` sozinho —
 * sem isso, cliques são medidos (o redirect `/r/[code]` roda no servidor do GrowthOS antes de
 * chegar na landing) mas signups nunca são, mesmo que o formulário externo mostre "sucesso".
 *
 * Este snippet é standalone: escuta submit de QUALQUER formulário da página (fase de captura, pra
 * não depender de a ferramenta externa deixar o evento propagar), acha um campo de e-mail por
 * heurística e manda um POST em paralelo — nunca chama preventDefault, então não interfere no
 * comportamento (redirecionamento, animação, etc.) que a ferramenta externa já tem.
 */
export function buildTrackingSnippet({
  productId,
  baseUrl,
}: {
  productId: string
  baseUrl: string
}): string {
  const endpoint = `${baseUrl}/api/lp/${productId}/signup`

  return `<!-- GrowthOS: rastreamento de inscrição — cole antes de </body> -->
<script>
(function () {
  var ENDPOINT = ${JSON.stringify(endpoint)};

  function findEmail(form) {
    var input = form.querySelector('input[type="email"], input[name="email"], input[name*="mail" i]');
    return input && input.value ? input.value.trim() : null;
  }

  document.addEventListener('submit', function (event) {
    var form = event.target;
    if (!(form instanceof HTMLFormElement)) return;

    var email = findEmail(form);
    if (!email) return;

    var params = new URLSearchParams(window.location.search);
    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        email: email,
        vid: params.get('vid') || undefined,
        ref: params.get('ref') || undefined,
      }),
    }).catch(function () {
      // Silencioso de propósito — nunca quebra o formulário original por causa do tracking.
    });
  }, true);
})();
</script>`
}
