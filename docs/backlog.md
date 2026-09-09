# Backlog do GrowthOS

## Fase 4.5 — Validação de Ideia

### Auto-aprovação e publicação de posts de validação

**Status:** Aberto  
**Prioridade:** Média  
**Esforço:** Pequeno

Posts gerados durante o teste de demanda (validação) ficam em `pending_approval` e exigem aprovação manual antes de serem agendados e publicados nos canais (Bluesky, LinkedIn).

**Cenário ideal:** Posts com `riskReview.verdict === 'approved'` deveriam transitar automaticamente para `approved` e depois serem agendados pelo `growth-tick`, sem intervenção manual.

**Contexto:**
- Arquivo: `src/trigger/generate-validation-content.ts:154`
- Risk review já roda automaticamente e produz um veredito
- Aprovação manual é um gate de segurança intencional
- Remover exige apenas criar um job que transicione status automaticamente para posts com verdict ≠ "block"

**Implementação:**
1. Criar job `auto-approve-validation-posts.ts` que rode após `generate-validation-content`
2. Filtrar posts de validação em `pending_approval`
3. Transicionar para `approved` se `riskReview.verdict === 'approved'` ou similar
4. Deixar `growth-tick` (job existente) agendar e publicar normalmente

**Bloqueadores:** Nenhum — funcional puro, sem dependências externas

### Reescrever posts com "flag" usando feedback do risk review

**Status:** Implementado (2026-09-08) — falta testar na UI real  
**Prioridade:** Alta  
**Esforço:** Médio

Posts com `riskReview.verdict === "flag"` ficavam bloqueados esperando revisão manual. Agora tem
botão "✨ Reformular com base no review" no painel de revisão de conteúdo.

**Implementado:**
- `writeValidationPost()` (`src/modules/validation/ai/write-validation-post.ts`) ganhou um
  parâmetro opcional `feedback` que injeta um bloco `<correcao_solicitada>` no prompt.
- `rewriteValidationPost(postId)` (`src/modules/validation/service.ts`) orquestra o fluxo: busca o
  post + a validação (via `findValidationByCampaignId`, novo em `repo.ts`) + a variante do
  experimento, monta o feedback (`reasons` + `suggestedFix`), reescreve, roda o risk review de
  novo e decide o status (`pass` → `approved`, `block` → `draft`, `flag` → `pending_approval` de
  novo, com o botão disponível pra tentar de novo).
- Só se aplica a posts de validação (`variantOf` setado) com veredito `flag` — `RewriteNotAllowedError`
  nos outros casos.
- Action `rewriteValidationPostAction` em `app/actions/validation.ts`; botão em
  `app/products/[id]/content/post-review-panel.tsx` (aparece só quando `verdict === 'flag'` e
  `post.variantOf` existe).
- Corrigido de brinde: o painel de revisão não resincronizava os campos (`hook`/`body`/`cta`) ao
  trocar de post ou depois de uma reescrita, porque o componente não remonta — adicionado
  `useEffect` que resincroniza o estado local quando o post do servidor muda.

**Achado ao testar (2026-09-08):** o primeiro teste real mostrou que **todo** post de validação
saía `flag`, reescrita ou não. Causa: `content.review-risk` foi desenhado pro produto já lançado
(perfil com diferenciais/prova social reais) e estava checando "tom promocional" e "claim sem
prova social" — mas na validação o produto não existe, o perfil não tem nada disso por definição,
e o post *precisa* ser chamativo (é um teste de demanda com CTA `direct` obrigatório). Reformular a
redação não resolvia porque o critério, não a redação, era o problema.

**Correção** (`review-risk.ts`): novo parâmetro `isValidation` que adiciona um bloco ao prompt
dizendo pra não marcar tom promocional/claim-sem-prova como risco nesse contexto, reservando
`flag`/`block` pra promessa numérica específica sem base, claim impossível, ou sugerir que o
produto já existe. Passado como `true` nas duas chamadas de `reviewRisk` da fase 4.5
(`generate-validation-content.ts` e `rewriteValidationPost`).

**Confirmado com 4 reescritas reais:** 1 saiu `pass` limpo; 2 ainda saíram `flag`, mas agora por
motivos que o próprio critério novo considera legítimos (`"reduzir de 20 minutos pra 10 segundos"`
como resultado garantido) — não é 100% (o modelo ainda desliza pra "tom promocional" às vezes,
instrução não é perfeitamente seguida), mas já é sinal muito mais calibrado que antes, onde era
sempre `flag` por padrão.

**Falta:** testar clicando de verdade pela UI (só testei via chamada direta à function).

### Gerar posts para todos os ângulos em todos os canais

**Status:** Resolvido — duas causas raiz corrigidas e confirmadas empiricamente  
**Prioridade:** Média  
**Esforço:** Pequeno

Teste da Fase 4.5 revelou: apenas 4 posts gerados ao invés de 6 esperados (3 ângulos × 2 canais).
Só 1 de 3 posts do Bluesky sobrevivia; os 3 do LinkedIn sempre passavam.

**Causa raiz nº 1 — memória de dedupe desatualizada dentro do run (corrigida e confirmada):** em
`src/trigger/generate-validation-content.ts`, a "memória de posts recentes" passada ao prompt
(`recentPosts`) era buscada **uma única vez antes do loop** de ângulos e nunca atualizada. Cada
`writeValidationPost()` de um ângulo seguinte não via os hooks já gerados pelos ângulos anteriores
*dentro do mesmo run*. Como o Bluesky tem limite de 300 grafemas contra 3000 do LinkedIn, o espaço
de hooks possíveis é muito mais apertado, e sem essa memória os ângulos convergiam para hooks
quase idênticos → `checkDedupe` descartava como duplicata.
**Correção:** a memória agora é uma lista local (`sessionMemory`) que começa com o histórico do
banco e recebe cada hook assim que é gerado, antes mesmo do dedupe.
**Confirmação (run real, validação `a1f683e0`, produto Warmline):** postsCount subiu de 4 para 5.

**Causa raiz nº 2 — loop de correção do limite de caracteres piorava o problema (corrigida e
confirmada com 20+ tentativas isoladas):** o Bluesky continuava estourando 300 grafemas mesmo
depois de apertar a dica de compactação duas vezes. Isolando `writeValidationPost` fora do
pipeline (sem tocar nas tabelas de validação) e rodando 5x com o mesmo ângulo que sempre falhava:
**0 de 5 couberam no limite mesmo com 4 tentativas cada**, e a contagem de grafemas não convergia
entre tentativas (chegou a piorar da 1ª pra 4ª). Ou seja, dizer ao modelo "você excedeu por N
grafemas, corrija" não funciona pra esse caso — às vezes o deixa **mais** verboso, não menos.
**Correção** (`write-validation-post.ts`): parar de pedir correção de tamanho pro modelo (o
`verify()` só valida hook curto demais agora) e reforçar o limite no código — `fitToChannelBudget()`
corta frases inteiras do fim do body até caber, em vez de descartar o post inteiro.
**Confirmação (5 tentativas isoladas, mesmo ângulo que sempre falhava):** 5 de 5 dentro do limite
— e, curiosamente, **nenhuma precisou de corte**: sem o loop de "correção" confundindo o modelo, a
primeira tentativa já saiu entre 130–285 grafemas.

**Lição pra daqui pra frente:** quando o modelo estoura um limite numérico duro de forma
consistente, cuidado em contar com o loop de correção do provider (`src/modules/ai/provider.ts`)
pra resolver — ele pode piorar. Prefira reforçar limites duros no código depois da geração.

---

## Landing Page Builder

### Auto-geração e deploy de landing pages

**Status:** Implementado (2026-09-08) — falta testar deploy real (precisa de `VERCEL_API_TOKEN`)  
**Prioridade:** Alta  
**Esforço:** Grande

Antecipado do backlog original (estava marcado "depende de Fase 5", mas o atrito de colar URL
manual estava travando o uso real da Fase 4.5 agora). Escopo ajustado em relação ao original:

- **Sem Claude Design/iframe** — não é tecnicamente viável embutir como iframe no app do usuário.
  Copy gerada por IA (`landing/ai/write-landing-page.ts`), HTML renderizado por template
  determinístico em código (`landing/template.ts`) — mais confiável que IA gerando markup direto.
- **Sem domínio customizado** — só `.vercel.app` grátis por enquanto (comprar domínio custa
  dinheiro real e precisa de confirmação explícita a cada vez; fica pra depois).
- **Deploy real via API do Vercel** (`POST /v13/deployments`, sem Git) — precisa de
  `VERCEL_API_TOKEN` no `.env` (gerar em vercel.com/account/tokens). Contrato da API confirmado
  contra a documentação atual antes de implementar.

**Arquitetura:** assíncrona, seguindo o mesmo padrão de `generate-validation-content` — tabela
`landing_pages` rastreia status (`generating`/`ready`/`blocked`/`failed`), job Trigger.dev/inline
(`src/trigger/generate-landing-page.ts`), UI faz polling (`AnalysisPoller`, já existente). Nova
tabela `waitlist_signups` (email real do lead, não só o evento de atribuição) e endpoint público
`POST /api/lp/[productId]/signup` (CORS liberado pra `*.vercel.app`) que reaproveita
`resolveAttribution`/`insertGrowthEvent` — o mesmo mecanismo de atribuição de `/api/events`, sem
exigir ingest key (é form público de lead, não API autenticada).

A copy passa pelo mesmo `reviewRisk`-style (`landing/ai/review-landing-risk.ts`, critério
`isValidation` já usado nos posts) — `block` impede o deploy.

**Testado (sem deploy real, sem `VERCEL_API_TOKEN` configurado ainda):** `writeLandingPageCopy` →
`reviewLandingPageRisk` → `renderLandingPageHtml` rodou de ponta a ponta contra o brief real do
Warmline. HTML bem formado, benefícios/headline corretos. Primeira tentativa saiu `block` — a
mesma tensão de claim numérico sem prova já vista nos posts ("25 minutos pra 10 segundos"); o
mecanismo de bloqueio funcionou como esperado (não teria deployado).

**Falta:** configurar `VERCEL_API_TOKEN` (e `VERCEL_TEAM_ID` se a conta for de time) e testar o
deploy de verdade + o fluxo completo pela UI (`/products/[id]/validation`, botão "✨ Gerar landing
page automaticamente").
