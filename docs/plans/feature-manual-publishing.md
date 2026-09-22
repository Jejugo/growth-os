# Feature — Modo de publicação manual por canal

> **Objetivo em uma frase:** para canais sem API utilizável (LinkedIn hoje), o GrowthOS faz tudo —
> gerar, aprovar, agendar, montar o texto com link rastreado — menos o clique final, que o dono faz
> a partir de uma fila "Para publicar".

Status: 📋 Planejado · Autor: Planejador · Data: 2026-09-22

---

## 1. Estado atual (validado contra o código em 2026-09-22)

### O que existe

| Ponto | Onde | Situação real |
|---|---|---|
| Adapter LinkedIn "manual_assist" | `src/modules/distribution/channels/linkedin.ts` | `publish()` devolve `outcome: 'unknown'` + `externalId: manual_assist:<id>` → o publisher grava a publicação como `unknown` e registra "aguardando reconciliação". Conflita com o significado de `unknown` ("a API talvez tenha publicado"). |
| Reconciliação | `src/trigger/reconcile-publications.ts` + `listUnknownPublications` (`repo.ts`) | Filtra só `status = 'unknown'`. Não há cron: só roda via `dispatchReconcilePublications` (`src/server/jobs.ts:144`). Para LinkedIn, `fetchRecent` devolve `[]` → após 3 tentativas marcaria a publicação como `failed`. |
| Growth tick | `src/trigger/growth-tick.ts` | Itera `['bluesky','linkedin','reddit']`; `listActiveChannelAccounts` vazio → `continue` silencioso (sem `decision`). |
| Geração de validação | `src/trigger/generate-validation-content.ts:25` | `VALIDATION_CHANNELS = ['bluesky','linkedin']` fixo. |
| Enum `publication_status` | `src/modules/distribution/schema.ts` / `drizzle/0002_regular_microbe.sql` | `scheduled, publishing, published, failed, unknown, cancelled`. |
| `publications.externalUrl` | `schema.ts` | **Já existe** (nullable). Não precisa de coluna nova. |
| `publications.channelAccountId` | `schema.ts` | **NOT NULL** com FK para `channel_accounts`. |
| `channel_accounts.credentials` | `schema.ts` | **NOT NULL** (texto cifrado AES-GCM). |
| Rate limit / limite diário | `service.ts` (`assertRateLimitOk`, `assertMinInterval`) + `repo.ts` (`countPublishedInWindow`, `lastPublishedAt`) | Todos chaveados por `channelAccountId`. `countPublishedInWindow` conta `status='published'` filtrando por **`scheduledFor`**, não por `publishedAt`. |
| Render + link rastreado | `renderContent()` em `src/modules/distribution/publisher.ts:164` (privada) | Cria/reutiliza `tracking_link` por `(postId, publicationId)` com `utmSource = channel`. Idempotente. Se `NEXT_PUBLIC_BASE_URL` não é público, publica o link direto **sem** `/r/`. |
| Atribuição de canal | `src/modules/attribution/resolve.ts` | `growth_events.channel = tracking_link.utmSource` → um signup via `/r/` de post LinkedIn já sai com `channel='linkedin'` sem mudança. |
| Métricas nativas | `src/modules/analytics/rollup.ts:230` | `impressions: 0` gravado fixo para **todos** os canais; nenhum código lê `impressions`. Não há coleta de métricas nativas nem para Bluesky. |
| UI de publicações | `app/products/[id]/publications/page.tsx` + `_components/publication-row.tsx` | Já tem seção "Aguardando confirmação" (para `unknown`) e botão cancelar. `STATUS_CLASS`/`statusConfig` são `Record<Publication['status'], …>` — quebram no `tsc` ao adicionar valor novo ao enum (bom: força tratar). |
| UI de canais | `app/products/[id]/channels/page.tsx` | Itera os 3 canais; só Bluesky tem formulário de conexão (`connect-bluesky-form.tsx`). Texto de atenção assume Bluesky como "V1". |
| Painel | `app/page.tsx` (h1 "Painel") | Sem avisos de pendência por canal. |
| Server actions | `app/actions/distribution.ts` | `scheduleAndPublish` cria publicação e dispara `publish-post` para **qualquer** conta — não sabe de canal manual. |

### Dados reais no banco de dev (consultado em 2026-09-22)

- `social_posts` LinkedIn: **8 em `pending_approval`** — 6 com `riskReview.verdict = 'pass'`, 2 com `flag`.
- `automation_policies`: LinkedIn existe com `level = 'automatic'`, sem kill switch.
- `channel_accounts`: só 1 Bluesky ativa; **nenhuma** LinkedIn.
- `publications`: 2 em `scheduled` (paradas), 12 `published`, 24 `cancelled`.

---

## 2. Divergências e riscos que o briefing não previu

1. **Os 8 posts parados não chegam à fila só com esta feature.** Eles estão em `pending_approval`
   (status do *post*), não do lado de publicação. O growth-tick só pega post `approved`. Mesmo os 6
   com `verdict='pass'` não foram auto-aprovados (o auto-approve provavelmente rodou antes deles
   existirem ou não foi disparado no lote "gerar mais"). → **Decidido (D1):** o Orquestrador
   descarta esses 8 posts agora (foram escritos para a validação que termina em 24/09); fora do
   escopo da feature. Os testes de aceite usam posts novos.
2. **Duplicação de publicação por post.** Hoje o post continua `approved` enquanto a publicação não
   termina; o tick das horas seguintes escolheria o **mesmo post** de novo (a idempotency key inclui
   `scheduledFor = now`, então não colide). No Bluesky automático isso é mascarado porque o
   `publish-post` roda na hora. Para manual (que fica horas/dias pendente) viraria um
   `awaiting_manual` novo por hora do mesmo post. **Obrigatório:** ao criar `awaiting_manual`, mover
   o post para `scheduled` (valor já existe em `post_status`) e o tick só considerar `approved`.
3. **Sem teto, a fila manual enche sozinha.** Se o pendente não conta para limite diário nem para o
   intervalo mínimo (ambos contam só `published`), o tick cria 1 item por hora → até 24/dia.
   Precisa de um teto de pendentes simultâneos. **Decidido (D3):** não criar novo
   `awaiting_manual` se já houver `>= maxPostsPerDay` pendentes no canal.
4. **`channelAccountId` NOT NULL + `credentials` NOT NULL.** O "cadastro leve" resolve os dois de
   uma vez: o canal manual continua tendo uma linha em `channel_accounts` (handle = nome da página),
   o que mantém a FK de `publications` e as chaves de rate limit. Exige tornar `credentials`
   nullable (ou gravar sentinela). Sem cadastro leve, `publications.channelAccountId` teria de
   virar nullable e o rate limit teria de mudar de chave — mais caro. **Recomendação:** cadastro
   leve obrigatório para canal manual aparecer na fila (decisão final do Arquiteto).
5. **Limite diário conta pela data de agendamento.** `countPublishedInWindow` filtra por
   `scheduledFor`. Para "contar a partir da confirmação", precisa filtrar por `publishedAt`
   (e gravar `publishedAt = momento do "Publiquei"`). A troca vale também para Bluesky (onde
   `publishedAt ≈ scheduledFor`), então é segura, mas tem que ter teste.
6. **Expirar/descartar precisa decidir o destino do post.** Se a publicação expira e o post volta
   para `approved`, o próximo tick recria o item → loop eterno de 3 em 3 dias. **Decidido (D2):**
   expirar e descartar levam o post para `cancelled`, definitivo.
7. **Caminhos que ainda mandam LinkedIn para a API.** `scheduleAndPublish` (server action) e o
   próprio `runPublisher` aceitam publicação de canal manual. Precisa de guarda: canal manual nunca
   entra em `publish-post`; o adapter LinkedIn deixa de devolver `unknown`.
8. **Texto final depende de `NEXT_PUBLIC_BASE_URL` público.** Em dev (localhost) o texto copiado
   sai **sem** `/r/`; critério de aceite 2 só é verificável em produção
   (`growthos-orbit.vercel.app`) ou com base URL pública.
9. **`ALTER TYPE … ADD VALUE`** em Postgres não pode ser usado na mesma transação em que é criado.
   A migration que adiciona `awaiting_manual` deve ficar isolada de qualquer `UPDATE`/`INSERT` que use
   o valor novo. E, como sempre: **rodar em `DATABASE_URL` e `TEST_DATABASE_URL`**
   (`pnpm db:migrate` e `pnpm db:migrate:test`).
10. **"Métricas nativas ausentes, não zero" é um problema de todos os canais**, não só do manual:
    `impressions` é sempre 0 e ninguém lê. O que esta feature precisa garantir é só não *introduzir*
    leitura de `impressions` que trate 0 como sinal. Ver seção 6.
11. **`allowedHours` para canal manual.** A janela hoje governa a *criação* da publicação. Em canal
    manual quem decide a hora real é o humano. **Decidido (D4):** `allowedHours` não se aplica a
    canal manual — o item entra na fila a qualquer hora.
12. **Significado de `level` para canal manual.** `automatic` e `approval_required` descrevem se o
    sistema publica sozinho — irrelevante quando quem publica é o humano. **Decidido (D9):** para
    canal manual, `automatic` e `approval_required` se comportam igual (criam `awaiting_manual`; o
    "Publiquei" é a aprovação); `suggestions_only` e kill switch continuam desligando o canal.
13. **"Um canal por tick".** O tick hoje para no primeiro canal agendado; com LinkedIn na rotação,
    um item manual roubaria a vez do Bluesky. **Decidido (D5):** canais manuais são tratados numa
    passada à parte e **não** consomem a vaga do "um canal por tick" — a mesma rodada ainda pode
    agendar um canal `api`.
14. **Cadastro leve precisa de URL da página** (D8) para o atalho "Abrir". `channel_accounts` não tem
    coluna para isso (`handle`, `displayName` apenas) → coluna nova.
15. **Validação sem política ativa (D7) precisa ser barrada antes de criar a validação.** Hoje
    `startValidationAction` (`app/actions/validation.ts:72`) cria a validação e só depois dispara a
    geração; se o erro nascer só dentro da task, a validação fica criada sem conteúdo. A checagem
    tem de vir antes de `startValidation`, e também no caminho "gerar mais posts"
    (`src/server/jobs.ts:202`).

---

## 3. Objetivo e escopo

### Entra

- `publishMode: 'api' | 'manual'` declarado no adapter (LinkedIn = manual, Bluesky = api,
  Reddit = api-stub inalterado).
- Status `awaiting_manual`, fila "Para publicar", ações Publiquei/Descartar, expiração em 3 dias.
- Limites contando pela confirmação + teto de pendentes.
- Cadastro leve de canal manual na tela de Canais.
- Canais de validação vindos das políticas ativas.
- Aviso no Painel.

### NÃO entra

- API do LinkedIn (Community Management), OAuth LinkedIn.
- Reddit funcional.
- Scraping/coleta de métricas nativas (impressões, curtidas).
- Edição do texto do post na fila (se quiser editar, edita o post antes — fluxo atual).
- Notificação fora do app (e-mail/push) de pendência.

### Histórias de usuário

- **H1.** Como dono, quero ver os posts de LinkedIn prontos para colar, com o link rastreado já no
  texto, para publicar em segundos sem montar nada.
- **H2.** Como dono, quero marcar "Publiquei" (opcionalmente colando a URL) para o sistema saber que
  o post está no ar e contar para os limites.
- **H3.** Como dono, quero descartar um item que não vou publicar, sem ele voltar sozinho.
- **H4.** Como dono, quero ser avisado no Painel quando há posts esperando por mim.
- **H5.** Como dono, quero que itens esquecidos expirem sozinhos em vez de acumular.

---

## 4. Banco

Uma migration nova (próximo número após `0011`), mais uma separada só para o enum se o Arquiteto
preferir isolar (ver risco 9).

1. `ALTER TYPE publication_status ADD VALUE 'awaiting_manual';`
2. `publications.manual_confirmed_at timestamptz NULL` — marca de confirmação humana.
   `published_at` também é preenchido com o mesmo instante (é o que limites e relatórios leem).
   `external_url` **já existe** — reutilizar.
3. `channel_accounts.credentials` → nullable (cadastro leve de canal manual não tem credencial).
   Código que decifra credenciais passa a tratar `null` como "sem credencial" e nunca é chamado para
   canal manual.
4. `channel_accounts.page_url text NULL` — URL da página do canal manual, usada pelo atalho
   "Abrir" (D8). Nome final da coluna fica com o Arquiteto.
5. Índice: o `publications_product_status_idx (product_id, status, scheduled_for)` já cobre
   "listar `awaiting_manual` do produto" e "expirar os mais antigos". Nada novo.
6. **Dupla migration:** `pnpm db:migrate` **e** `pnpm db:migrate:test`.

`publishMode` **não** vai para o banco — é propriedade do adapter.

---

## 5. Backend

### 5.1 Adapter

- `DistributionChannel` (`src/modules/distribution/types.ts`) ganha `readonly publishMode: 'api' | 'manual'`.
- `LinkedInChannel.publishMode = 'manual'`; `publish()` passa a lançar/retornar `permanent`
  ("canal manual não publica via API") — nunca mais `unknown`.
- Helper `isManualChannel(channel)` no registry.
- Cada adapter manual expõe um fallback de URL de feed (LinkedIn: `https://www.linkedin.com/feed/`)
  para o atalho "Abrir" quando o cadastro não tem `page_url` (D8).

### 5.2 Growth tick (`src/trigger/growth-tick.ts`)

O tick passa a ter **duas passadas independentes** por produto (D5), depois dos gates comuns
(estágio do produto, kill switch global):

**Passada manual** — para cada canal com `publishMode = 'manual'`:

1. Política existente, `level != 'suggestions_only'`, sem kill switch do canal.
   `automatic` e `approval_required` se comportam igual (D9). **`allowedHours` não é checado** (D4).
2. Exige **cadastro leve** ativo (`listActiveChannelAccounts` continua funcionando, já que o
   cadastro leve é uma `channel_account`). Sem cadastro → `decision` `NO_ACTION`
   ("canal manual sem cadastro") em vez do `continue` silencioso de hoje.
3. **Teto de pendentes (D3):** se `count(awaiting_manual do canal) >= policy.maxPostsPerDay` →
   `NO_ACTION` ("fila manual cheia").
4. Limite diário e intervalo mínimo contam só `published`, pela confirmação: ajustar
   `countPublishedInWindow` para filtrar por `publishedAt` (vale para todos os canais).
5. Seleciona post `approved` mais antigo do canal.
6. Cria publicação **direto em `awaiting_manual`**, move o post para `scheduled`, gera o tracking
   link chamando o render (5.3), grava `decision` `SCHEDULE` ("aguardando publicação manual").
7. **Não** enfileira `publish-post`.
8. Cria no máximo **1 item por canal manual por tick**.

**Passada api** — exatamente como hoje (ordem, `allowedHours`, "um canal por tick", disparo do
`publish-post`), só iterando os canais `publishMode = 'api'`. Um item manual criado na mesma rodada
não impede o agendamento do canal api.

O retorno da task passa a reportar as duas passadas (ex.: `{ manual: [...], api: {...} }`).

### 5.3 Render compartilhado

Extrair `renderContent` de `publisher.ts` para uma função exportada (ex.:
`renderPublicationContent(publicationId)`), usada:
- pelo publisher (inalterado em comportamento);
- pelo tick, na criação do `awaiting_manual` (garante o tracking link e roda `adapter.validate`;
  se inválido → publicação `failed` com erro, igual ao publisher);
- pela fila "Para publicar", para mostrar o texto final. Idempotente por `(postId, publicationId)`,
  então chamar de novo não cria link novo.

Não persistir o texto renderizado em coluna (evita divergir do post se ele for editado antes da
publicação). Decisão pequena — Arquiteto pode reverter.

### 5.4 Ações (serviço + server actions em `app/actions/distribution.ts`)

- `confirmManualPublication(publicationId, externalUrl?)`
  - só a partir de `awaiting_manual` (update condicional no status, idempotente — duplo clique não
    duplica);
  - `externalUrl`, se presente, precisa ser URL `http(s)` válida — qualquer domínio (D6); inválida →
    erro de validação devolvido à UI, nada é gravado;
  - publicação → `published`, `publishedAt = manualConfirmedAt = now()`, `externalUrl`;
  - post → `published`;
  - `recordSuccessfulRequest(accountId)` para manter `rate_limit_state` coerente;
  - `decision` actor `human`, decision `PUBLISH`, rationale "publicado manualmente".
- `discardManualPublication(publicationId)`
  - só a partir de `awaiting_manual`; publicação → `cancelled`; post → `cancelled`, definitivo (D2);
  - `decision` actor `human`, decision `CANCEL`, rationale "descartado na fila manual".
- `registerManualChannel(productId, channel, { pageName, pageUrl? })` — cria/atualiza o cadastro
  leve (`handle`/`displayName` = nome da página, `page_url`, `credentials = null`, `status =
  'active'`). Recusa canal `api`. `pageUrl`, se informada, precisa ser `http(s)` válida.
- Leitura para a UI: `listManualQueue(productId)` (itens `awaiting_manual` + texto renderizado +
  `expiresAt = createdAt + 3 dias` + URL do atalho) e `countManualPendingByProduct()` para o Painel.
- Guardas: `scheduleAndPublish` e `runPublisher` recusam publicação de canal manual.
  `cancelPublicationAction` atual continua servindo `scheduled`/`unknown`.

#### Contratos backend expostos ao Frontend

As mutações abaixo são Server Actions autenticadas, retornando `{ success: true, ... }` ou
`{ error: string }` sem lançar erros de validação esperados:

```ts
confirmManualPublication(publicationId: string, externalUrl?: string): Promise<
  { success: true; idempotent: boolean } | { error: string }
>
discardManualPublication(publicationId: string): Promise<
  { success: true; idempotent: boolean } | { error: string }
>
registerManualChannel(
  productId: string,
  channel: 'bluesky' | 'linkedin' | 'reddit',
  data: { pageName: string; pageUrl?: string },
): Promise<{ success: true } | { error: string }>
listManualQueue(productId: string): Promise<ManualQueueItem[]>
countManualPendingByProduct(): Promise<Record<string, number>>
```

`ManualQueueItem` contém `publicationId`, `productId`, `postId`, `channel`, `pageName`, `pageUrl`,
`text`, `linkUrl?`, `createdAt`, `expiresAt` e `openUrl`. `externalUrl` aceita qualquer URL
`http(s)` válida; `confirmManualPublication` e `discardManualPublication` são idempotentes.

### 5.5 Expiração

- Nova task `expire-manual-publications` com cron (ex.: a cada hora, ou dentro do
  `growth-tick-hourly` — decisão do Arquiteto).
- `awaiting_manual` com `createdAt < now() - 3 dias` → `cancelled`,
  `lastError = { reason: 'expired_manual' }`, post → `cancelled`, definitivo (D2).
- `decision` actor `expirer`, decision `CANCEL`, rationale
  **"expirou sem publicação manual"** (texto exato do briefing).
- Idempotente: update condicional em `status = 'awaiting_manual'`.

### 5.6 Reconciliação

- `listUnknownPublications` já filtra `unknown` → `awaiting_manual` fica fora por construção.
- Defesa extra em `reconcileOne`: se o canal da conta é manual, retorna sem tocar.
- Teste explícito cobrindo isso (critério 6).

### 5.7 Geração de validação

- Trocar `VALIDATION_CHANNELS` (`generate-validation-content.ts:25`) por: canais com
  `automation_policy` existente, `level != 'suggestions_only'` e sem kill switch, **incluindo
  manuais**. Função reutilizável (ex.: `listValidationChannels(productId)`).
- **Sem nenhuma política ativa → erro claro, sem fallback (D7):**
  - `startValidationAction` (`app/actions/validation.ts:72`) checa **antes** de `startValidation`
    e devolve `{ error: 'Nenhum canal com política ativa. Configure pelo menos um canal em Canais
    antes de iniciar a validação.' }` — a validação não é criada;
  - o caminho "gerar mais posts" (`src/server/jobs.ts:202` e sua action) faz a mesma checagem e
    devolve o mesmo erro;
  - a task também lança erro explícito se chegar sem canais (defesa; não deveria acontecer).

---

## 6. Dados e aprendizado

- Cliques e signups: nada muda — `tracking_link.utmSource = 'linkedin'` já propaga para
  `growth_events.channel`. Verificar ponta a ponta em produção (critério 2).
- Métricas nativas: canal manual (e hoje, na prática, todos) não tem impressões/curtidas.
  - Não introduzir nenhuma métrica derivada de `impressions` nesta feature.
  - Deixar documentado em `rollup.ts` que `impressions = 0` significa "não coletado". Tornar a
    coluna nullable fica como opção para quando existir coleta real (fora do escopo).
  - Learnings (`generate-learnings.ts`) comparam por cliques/signups — conferir que nenhum prompt
    ou cálculo cita impressões.
- **Nota para a fase 5** (adicionar em `phase-5-growth-missions.md`, seção de riscos/notas):
  "Canal manual tem capacidade limitada pelo humano (teto = `maxPostsPerDay` pendentes
  simultâneos). A alocação de esforço entre canais precisa respeitar esse teto e não pode tratar
  canal manual como capacidade infinita."

---

## 7. UI

Fluxo de interface → Frontend/UX define layout e hierarquia; o que segue é o requisito.

### 7.1 Fila "Para publicar" (por produto)

Local sugerido: seção no topo de `app/products/[id]/publications/page.tsx`, acima de
"Aguardando confirmação" (que continua só para `unknown`), com contador também no item
"Publicações" da `product-nav`. Alternativa: rota própria `/products/[id]/publish`. Decisão de UX.

Cada item:
- canal + nome da página (cadastro leve), idade do item e "expira em Xd Yh";
- texto final renderizado (com `/r/<code>`), somente leitura;
- **Copiar** (clipboard; feedback "copiado");
- **Abrir LinkedIn** → abre em nova aba a `page_url` do cadastro leve; sem `page_url`, o feed do
  canal (`https://www.linkedin.com/feed/`) (D8);
- **Publiquei** → campo opcional "URL do post" (qualquer URL `http(s)`, D6) + confirmar; erro de URL
  inválida aparece no próprio campo;
- **Descartar** → confirmação leve (sem `confirm()` nativo, se possível), avisando que é definitivo;
- aviso quando o texto não tem `/r/` (base URL não pública): "link sem rastreio — cliques não
  serão atribuídos";
- estado vazio: "Nada esperando você" (e, se não há cadastro leve, link para Canais).

### 7.2 Aviso no Painel (`app/page.tsx`)

- "N posts esperando você no LinkedIn" por produto, link para a fila. Some quando N = 0.

### 7.3 Tela de canais (`app/products/[id]/channels/page.tsx`)

- LinkedIn com selo **"Manual"**, texto curto explicando ("o GrowthOS prepara, você cola").
- Formulário de cadastro leve: nome da página (obrigatório) + URL da página (opcional), sem OAuth,
  sem senha. Editável depois.
- Política de automação continua editável. Para canal manual: não mostrar a escolha
  `automatic` × `approval_required` como diferente (D9 — explicar que o "Publiquei" é a aprovação),
  esconder ou desabilitar `allowedHours` (D4) e explicar que "máx. por dia" também é o teto da fila
  (D3).
- Ajustar o texto de "atenção" que hoje assume só Bluesky.

### 7.4 Status nos componentes existentes

- `STATUS_CLASS` (publications/page.tsx) e `statusConfig` (publication-row.tsx):
  `awaiting_manual` → rótulo "esperando você".

### 7.5 Validação

- O formulário de iniciar validação e o botão "gerar mais posts" exibem o erro de "nenhum canal
  com política ativa" (D7) com link para Canais.

---

## 8. Workflows

```
post approved ──tick (passada manual)──► publication awaiting_manual
                                          (post → scheduled, tracking link criado)
                          │
          ┌───────────────┼──────────────────────┐
     "Publiquei"      "Descartar"           3 dias sem ação
          ▼               ▼                      ▼
 publication published   cancelled            cancelled (expired_manual)
 post published          post cancelled       post cancelled
 decision PUBLISH        decision CANCEL      decision CANCEL "expirou sem publicação manual"
```

Nenhum ramo passa por `publish-post` nem por `reconcile-publications`. A passada api do mesmo tick
segue independente.

---

## 9. Tarefas para delegar

Ordem obrigatória: **B1 (migration + tipos) primeiro**. O Frontend começa assim que B1 estiver no
`main` (tipos do enum e colunas disponíveis) e pode usar os contratos das actions de B5/B6 como
stub até elas chegarem. Integração final da UI depende de B5 e B6.

### Tarefa Backend (Alicerce)

| # | Etapa | Depende de |
|---|---|---|
| B1 | Migration: `awaiting_manual` no enum (isolado), `publications.manual_confirmed_at`, `channel_accounts.credentials` nullable, `channel_accounts.page_url`. Rodar em `DATABASE_URL` **e** `TEST_DATABASE_URL`. Atualizar `schema.ts`/tipos. | — |
| B2 | `publishMode` no adapter + `isManualChannel` + URL de feed fallback; LinkedIn para de devolver `unknown`; guardas em `runPublisher` e `scheduleAndPublish`. | B1 |
| B3 | Extrair render compartilhado (`renderPublicationContent`). | B1 |
| B4 | Growth tick em duas passadas (5.2): manual sem `allowedHours`, teto = `maxPostsPerDay`, post → `scheduled`, `decision` quando falta cadastro; `countPublishedInWindow` por `publishedAt`. | B2, B3 |
| B5 | Serviço + server actions: `confirmManualPublication`, `discardManualPublication`, `registerManualChannel`, `listManualQueue`, `countManualPendingByProduct`. | B3 |
| B6 | Canais de validação por política + erro sem fallback em `startValidationAction` e "gerar mais posts". | B1 |
| B7 | Task `expire-manual-publications` + cron. | B1 |
| B8 | Defesa no `reconcileOne`. | B2 |
| B9 | Testes (lista da DoD) + nota na fase 5 + nota em `rollup.ts` sobre `impressions`. | B4–B8 |

### Tarefa Frontend (Vitrine)

| # | Etapa | Depende de |
|---|---|---|
| F1 | Rótulo `awaiting_manual` em `STATUS_CLASS`/`statusConfig`. | B1 |
| F2 | Tela de Canais: selo "Manual", cadastro leve (nome + URL opcional), política adaptada para manual (D3, D4, D9), texto de atenção. | B1 (integra com B5) |
| F3 | Fila "Para publicar": texto, copiar, abrir (page_url → feed), Publiquei com URL opcional, Descartar, "expira em", estados vazio e sem rastreio. | B1 (integra com B5) |
| F4 | Aviso no Painel + contador na `product-nav`. | B5 |
| F5 | Erro "nenhum canal com política ativa" no formulário de validação e no "gerar mais posts". | B6 |

**QA (Sentinela)** — critérios de aceite abaixo, com o 2 em produção.

---

## 10. Critérios de aceite

1. **Dado** um produto com política LinkedIn ativa, cadastro leve de LinkedIn e um post LinkedIn
   `approved`, **e nenhuma credencial LinkedIn**, **quando** o growth tick roda (a qualquer hora,
   mesmo fora de `allowedHours`), **então** surge uma publicação `awaiting_manual` visível na fila
   "Para publicar", o post fica `scheduled` e nenhum `publish-post` é disparado.
2. **Dado** um item na fila em produção, **quando** copio o texto, **então** ele contém
   `https://<base pública>/r/<code>`; **e quando** um visitante clica e faz signup, **então** o
   `growth_event` de signup tem `channel = 'linkedin'` e o `post_id` do item.
3. **Dado** um item `awaiting_manual`, **quando** clico "Publiquei" (sem URL, ou com qualquer URL
   `http(s)` válida), **então** a publicação vai para `published` com `publishedAt`/
   `manualConfirmedAt` preenchidos, `externalUrl` gravada se informada, o post vai para `published`
   e há `decision` PUBLISH do actor `human`. URL inválida é recusada sem gravar nada. Duplo clique
   não gera efeito duplicado.
4. **Dado** um item `awaiting_manual` criado há mais de 3 dias, **quando** a expiração roda,
   **então** a publicação e o post ficam `cancelled` e existe `decision` com
   "expirou sem publicação manual". Rodar de novo não cria segunda `decision` e o post não volta.
5. **Dado** `maxPostsPerDay = 2` e 2 itens LinkedIn pendentes criados hoje (nenhum confirmado),
   **quando** consulto o limite diário, **então** ele conta 0 — pendentes não travam o canal;
   **e** o tick não cria um 3º pendente (teto da fila).
6. **Dado** uma publicação `awaiting_manual` antiga, **quando** `reconcile-publications` roda,
   **então** ela não é lida nem alterada (teste automatizado).
7. **Dado** "Descartar", **então** publicação e post ficam `cancelled`, com `decision`, e o tick
   seguinte não recria o item.
8. **Dado** uma validação nova com políticas Bluesky e LinkedIn ativas, **quando** o conteúdo é
   gerado, **então** há posts para os dois canais; com só Bluesky ativo, só Bluesky; **sem nenhuma
   política ativa**, iniciar a validação mostra erro claro e nenhuma validação é criada.
9. **Dado** Bluesky e LinkedIn elegíveis no mesmo tick, **quando** o tick roda, **então** cria o
   item manual do LinkedIn **e** agenda/publica o Bluesky na mesma rodada.
10. **Dado** cadastro leve com URL da página, "Abrir LinkedIn" abre essa URL; sem URL, abre o feed.
11. Bluesky continua publicando automaticamente sem regressão (suite existente verde).

### Definition of Done

- Critérios 1–11 passando (2 em produção).
- Migration aplicada em `DATABASE_URL` e `TEST_DATABASE_URL`; roda do zero e sobre banco com dados.
- Testes novos: tick em duas passadas (manual + api na mesma rodada), manual ignora `allowedHours`,
  teto de pendentes, limite por `publishedAt`, confirmar/descartar idempotentes, validação de URL,
  expiração idempotente, reconcile ignora manual, canais de validação por política e erro sem
  política.
- `pnpm test` e `tsc` verdes.
- Nota da fase 5 escrita; este documento atualizado com o que foi construído (retrospectiva).

---

## 11. Decisões de produto (dono, 2026-09-22)

- **D1.** Os 8 posts LinkedIn parados em `pending_approval` são descartados agora pelo Orquestrador
  (escritos para a validação que termina em 24/09). Fora do escopo da feature.
- **D2.** Post de item expirado ou descartado vai para `cancelled`, definitivo.
- **D3.** Teto de pendentes `awaiting_manual` por canal = `maxPostsPerDay` da política do canal.
- **D4.** `allowedHours` **não** se aplica a canal manual.
- **D5.** Canal manual **não** entra no "um canal por tick": o tick trata manuais à parte e ainda
  pode agendar um canal api na mesma rodada.
- **D6.** `externalUrl` aceita qualquer URL `http(s)` válida.
- **D7.** Iniciar validação sem nenhuma política ativa = erro claro na UI, sem fallback.
- **D8.** Cadastro leve guarda a URL da página; o atalho abre essa URL, com fallback para o feed do
  canal.
- **D9.** `automatic` e `approval_required` se comportam igual em canal manual (o "Publiquei" é a
  aprovação).

Não há perguntas de produto em aberto. Decisões técnicas restantes (nome da coluna `page_url`,
expiração em task própria ou dentro do tick, formato do retorno do tick) ficam com o Arquiteto.

## 12. Retrospectiva da implementação Backend

- B1–B8 foram implementados em commits pequenos no `main`; o enum foi separado das alterações de
  colunas para respeitar a regra transacional do Postgres.
- O growth tick retorna passadas `manual` e `api`; o canal manual nunca é enviado ao
  `publish-post` nem ao reconciliador.
- A fila manual re-renderiza o texto sob demanda e mantém o tracking link idempotente por
  `(postId, publicationId)`.
- A validação de conteúdo usa políticas ativas do produto, sem fallback fixo de canais.
- A expiração usa cron horário e transição condicional; confirmação e descarte também são
  idempotentes.
