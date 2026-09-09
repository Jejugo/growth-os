import type { LandingPageCopy } from './types'

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Página self-contained (CSS/JS inline, sem CDN externo) — evita dependência
 * de rede e problemas de CSP num deploy separado do app principal. O form
 * lê `vid`/`ref` da própria query string (não de cookie — a landing vive
 * num domínio diferente do app, e `/r/[code]` já propaga isso na URL).
 */
export function renderLandingPageHtml(
  copy: LandingPageCopy,
  options: { productName: string; formActionUrl: string },
): string {
  const benefitsHtml = copy.benefits
    .map(
      (b) => `
        <li class="benefit">
          <strong>${escapeHtml(b.title)}</strong>
          <p>${escapeHtml(b.description)}</p>
        </li>`,
    )
    .join('')

  const socialProofHtml = copy.socialProofLine
    ? `<p class="social-proof">${escapeHtml(copy.socialProofLine)}</p>`
    : ''

  const microcopyHtml = copy.ctaMicrocopy
    ? `<p class="microcopy">${escapeHtml(copy.ctaMicrocopy)}</p>`
    : ''

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(options.productName)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: #0b0c10;
    color: #f4f4f5;
    line-height: 1.5;
  }
  main {
    max-width: 640px;
    margin: 0 auto;
    padding: 64px 24px 80px;
  }
  .eyebrow {
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #a1a1aa;
    margin: 0 0 16px;
  }
  h1 {
    font-size: clamp(28px, 5vw, 42px);
    line-height: 1.15;
    margin: 0 0 16px;
  }
  .subheadline {
    font-size: 18px;
    color: #d4d4d8;
    margin: 0 0 40px;
  }
  form {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 8px;
  }
  input[type="email"] {
    flex: 1 1 240px;
    padding: 14px 16px;
    border-radius: 10px;
    border: 1px solid #3f3f46;
    background: #18181b;
    color: #f4f4f5;
    font-size: 16px;
  }
  input[type="email"]::placeholder { color: #71717a; }
  button {
    padding: 14px 24px;
    border-radius: 10px;
    border: none;
    background: #f4f4f5;
    color: #0b0c10;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
  }
  button:disabled { opacity: 0.6; cursor: default; }
  .microcopy { font-size: 13px; color: #71717a; margin: 0 0 40px; }
  .social-proof { font-size: 14px; color: #a1a1aa; margin: 0 0 40px; }
  ul.benefits {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 20px;
  }
  .benefit strong { display: block; font-size: 17px; margin-bottom: 4px; }
  .benefit p { margin: 0; color: #a1a1aa; font-size: 15px; }
  #success {
    display: none;
    padding: 16px;
    border-radius: 10px;
    background: #16321f;
    color: #86efac;
    font-size: 15px;
  }
  #error {
    display: none;
    margin: 0 0 12px;
    color: #fca5a5;
    font-size: 14px;
  }
</style>
</head>
<body>
<main>
  <p class="eyebrow">${escapeHtml(options.productName)}</p>
  <h1>${escapeHtml(copy.headline)}</h1>
  <p class="subheadline">${escapeHtml(copy.subheadline)}</p>

  <p id="error"></p>
  <form id="waitlist-form">
    <input type="email" name="email" placeholder="seu@email.com" required>
    <button type="submit">${escapeHtml(copy.ctaText)}</button>
  </form>
  ${microcopyHtml}
  <p id="success">Você está na lista! Avisamos assim que abrir.</p>

  ${socialProofHtml}

  <ul class="benefits">${benefitsHtml}
  </ul>
</main>
<script>
(function () {
  var params = new URLSearchParams(window.location.search);
  var vid = params.get('vid') || undefined;
  var ref = params.get('ref') || undefined;
  var form = document.getElementById('waitlist-form');
  var errorEl = document.getElementById('error');
  var successEl = document.getElementById('success');

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    errorEl.style.display = 'none';
    var button = form.querySelector('button');
    button.disabled = true;
    var email = form.email.value;

    fetch(${JSON.stringify(options.formActionUrl)}, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, vid: vid, ref: ref }),
    })
      .then(function (res) {
        if (!res.ok) throw new Error('request-failed');
        form.style.display = 'none';
        successEl.style.display = 'block';
      })
      .catch(function () {
        errorEl.textContent = 'Algo deu errado. Tente de novo em instantes.';
        errorEl.style.display = 'block';
        button.disabled = false;
      });
  });
})();
</script>
</body>
</html>`
}
