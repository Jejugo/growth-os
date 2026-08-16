# Fase 0 — Fundação

> **Marco:** colo uma URL de SaaS no GrowthOS, a aplicação analisa o site, cria um Product Profile
> persistente e editável, e mostra tudo no dashboard.

---

## Estado atual

Repositório vazio, apenas `init.md`. Nada existe.

---

## Objetivo

Ter o esqueleto operacional do sistema — banco, auth, jobs, camada de IA, observabilidade — provado
por um fluxo real de ponta a ponta: **URL → crawl → análise → Product Profile editável**.

O valor desta fase não é a análise de produto em si. É que ao final dela existe um lugar correto
para colocar todo o resto: uma chamada de LLM validada e contabilizada, um job idempotente com log
de decisão, e uma migration que roda. Se esses quatro trilhos estiverem tortos, todas as fases
seguintes herdam o problema.

---

## Escopo

### Dentro

- setup do repositório (TS estrito, lint com regras de fronteira de módulo, CI)
- Postgres/Neon + Drizzle + migrations
- auth single-user (OAuth + allowlist de e-mail)
- CRUD de produtos
- crawler educado com cache por hash
- pipeline de análise de produto (2 chamadas de LLM)
- `ProductProfile` versionado e editável, com preservação de edições humanas
- `AIProvider` + roteamento de tier + contabilidade de custo
- Trigger.dev com uma task real, idempotente e observável
- dashboard mínimo: lista de produtos + página de perfil
- Sentry + PostHog conectados

### Fora (explicitamente)

Audiências, campanhas, conteúdo, canais, agendamento, atribuição, missões (a tabela `missions`
existe, sem nenhuma lógica), qualquer coisa multi-usuário, qualquer coisa de billing.

---

## Mudanças de banco

```ts
// modules/products/schema.ts
products {
  id            uuid pk
  name          text
  url           text            // normalizada: https, sem trailing slash, sem query
  domain        text            // extraído da url; unique junto com o owner
  status        enum('active','paused','archived') default 'active'
  createdAt, updatedAt
}

product_crawl_snapshots {
  id            uuid pk
  productId     uuid fk → products
  pageUrl       text
  pageRole      enum('home','pricing','features','about','docs','blog','other')
  httpStatus    int
  title         text
  extractedText text                    // texto limpo, truncado em ~30k chars
  contentHash   text                    // sha256 do extractedText
  fetchedAt     timestamptz
  unique(productId, pageUrl, contentHash)
}

product_profiles {
  id                  uuid pk
  productId           uuid fk → products
  version             int                       // incremental por produto
  isCurrent           boolean                   // exatamente um true por produto
  source              enum('ai','human','merged')
  promptVersion       text
  crawlBatchId        uuid                      // agrupa os snapshots que geraram este perfil

  // campos-chave como colunas (consultáveis, usados em prompts)
  productName         text
  oneLiner            text
  primaryProblem      text
  valueProposition    text
  pricingSummary      text

  // o resto como JSONB validado por Zod na borda
  data                jsonb   // targetUsers[], industries[], useCases[], differentiators[],
                              // ctas[], competitors[], keywords[], objections[], contentThemes[]

  lockedFields        text[]  // campos editados por humano; nunca sobrescritos por IA
  confidence          jsonb   // 0..1 por campo, reportado pelo modelo
  createdAt, updatedAt
  unique(productId, version)
}
```

```ts
// modules/ai/schema.ts
ai_calls {
  id, task, promptVersion, tier, model,
  productId?, missionId?, campaignId?,          // dimensões de custo
  inputTokens, outputTokens, costUsd numeric(12,6),
  latencyMs, status enum('ok','invalid','error'), errorMessage?,
  createdAt
}
```

```ts
// lib/observability/schema.ts
job_runs {
  id, taskName, idempotencyKey unique, productId?,
  status enum('started','completed','failed','retried','cancelled'),
  triggerRunId, input jsonb, error jsonb?, startedAt, endedAt
}

decisions {
  id, productId, actor, decision, rationale text,
  inputsSnapshot jsonb, aiCallId?, createdAt
}
```

Tabelas criadas vazias nesta fase (só para fixar FKs cedo): `missions`.

**Migration:** uma única migration inicial. Extensão `pg_trgm` habilitada já aqui (custa nada e
evita uma migration de extensão no meio da fase 1).

---

## Mudanças de backend

### `modules/ai`

- `AIProvider` conforme roadmap §4, implementado sobre o Vercel AI SDK.
- Mapa tier → modelo em `config/models.ts` (única fonte).
- `withCostTracking()` envolve toda chamada e grava `ai_calls` mesmo em caso de erro.
- `validateStructured()`: parse Zod → checagens factuais → 1 retry com o erro no prompt → erro duro.

### `modules/products`

**`crawler.ts`** — descoberta e coleta:

1. Normaliza a URL. Rejeita IPs privados e localhost (SSRF).
2. Lê `robots.txt`; respeita `Disallow` para o nosso user-agent.
3. Descobre páginas: `sitemap.xml` se existir; senão, links da home filtrados por padrões
   (`/pricing`, `/features`, `/about`, `/product`, `/docs`).
4. Busca **no máximo 6 páginas**, 10s de timeout cada, 1 req/s por domínio, seguindo até 3 redirects.
5. Extrai texto legível (`cheerio` + heurística de conteúdo principal); descarta nav/footer/script.
6. Calcula `contentHash`. Se já existe snapshot idêntico, reutiliza — **não refaz a análise**
   (seção 5 do `init.md`: não recrawlear sem necessidade).

**`ai/analyze-product.ts`** — duas chamadas, propositalmente separadas:

| Passo | Tier | Entrada | Saída |
|---|---|---|---|
| 1. Extração factual | `cheap` | texto bruto das páginas | fatos literais: nome, tagline, preços, CTAs, features listadas |
| 2. Inferência de posicionamento | `strong` | fatos do passo 1 | problema, ICP, proposta de valor, diferenciais, objeções, keywords, temas |

Separar isso importa por três motivos: o passo 1 é barato e cacheável por `contentHash`; o passo 2
não alucina preços porque só vê fatos já extraídos; e dá para reprocessar só a inferência quando o
prompt de estratégia melhorar, sem recrawlear.

**`service.ts` — `applyProfile()`** (o ponto delicado da fase):

Uma nova análise **nunca** sobrescreve o que o humano editou.

```text
novo perfil de IA + perfil atual
   → para cada campo em lockedFields: mantém o valor humano
   → demais campos: usa o valor da IA
   → cria uma NOVA versão (source='merged'), marca isCurrent
   → versões antigas ficam, para diff e rollback
```

Editar um campo na UI adiciona esse campo a `lockedFields`. Existe um botão explícito de
"desbloquear e reanalisar" por campo.

### `modules/audiences`, `campaigns`, `content`, ...

Não existem ainda. Não criar pastas vazias.

---

## Workflows em background

`trigger/analyze-product.ts`:

```text
payload: { productId, force?: boolean }
idempotencyKey: `analyze-product:${productId}:${dateHour}`   (force → + nonce)

1. registra job_run: started
2. checa orçamento do produto → se excedido, aborta com decisão logada
3. crawl (com cache por contentHash)
4. se nada mudou e !force → completed com resultado 'unchanged'; sai
5. extração factual (cheap)
6. inferência (strong)
7. valida + faz merge com lockedFields
8. grava nova versão do perfil
9. registra decision + job_run: completed
```

Retries: 3 tentativas com backoff exponencial. Seguro porque o job só escreve no banco no fim, em
uma transação — não há efeito externo irreversível nesta fase. Este é o único ponto do sistema onde
retry cego é aceitável, justamente porque nada sai para fora.

---

## Mudanças de UI

- `/login` — OAuth, allowlist.
- `/products` — lista, com estado da última análise (`nunca | rodando | ok | falhou`).
- `/products/new` — um input de URL. Dispara a análise e vai para a página do produto.
- `/products/[id]` — Product Profile: todos os campos, editáveis inline, indicação visual do que
  é IA e do que é humano (`lockedFields`), confiança por campo, botão "reanalisar", histórico de
  versões com diff.
- `/` — dashboard: lista de produtos, análises recentes, custo de IA do mês. Nada mais; o
  dashboard rico só faz sentido quando houver conteúdo e conversões.

Toda regra vive em `service.ts`. Server actions só validam entrada, chamam o service e revalidam.

---

## Integrações externas

Anthropic (via AI SDK), Neon, Trigger.dev, Sentry, PostHog, provider OAuth. Nenhuma rede social.

---

## Riscos

| Risco | Mitigação |
|---|---|
| SSRF pela URL fornecida | Allowlist de esquema, bloqueio de IP privado/loopback/metadata, resolução de DNS checada antes do fetch |
| Site é SPA e o HTML vem vazio | Detectar `extractedText` curto demais (< 500 chars) e marcar o perfil como `low_confidence` com aviso na UI. **Não** adicionar navegador headless nesta fase — anotar como possível fase 0.1 se acontecer com frequência real |
| Sites grandes estouram contexto/custo | Teto de 6 páginas e truncagem em ~30k chars por página |
| Perfil bom demais no papel e errado na prática | O fundador edita e as edições são preservadas; é exatamente para isso que existe `lockedFields` |
| Over-engineering da camada de IA | A interface tem 2 métodos. Nada de cadeia de middlewares, nada de "agent runtime" |
| Migration inicial ruim trava tudo depois | Revisar o SQL gerado à mão; testar `migrate` num banco com dados semeados |

---

## Critérios de aceite

1. `pnpm db:migrate` roda do zero em um banco limpo e também sobre um banco já populado.
2. Login funciona; um e-mail fora da allowlist é rejeitado.
3. Cadastrar `https://exemplo.com` cria o produto e enfileira a análise em < 1s de resposta na UI.
4. A análise conclui e produz um `ProductProfile` com todos os campos-chave preenchidos ou
   explicitamente `null` (nunca string vazia ou inventada).
5. Editar `primaryProblem` e rodar "reanalisar" **preserva** o texto editado e atualiza os demais.
6. Rodar a análise duas vezes seguidas sem mudança no site **não** cria uma nova versão e não gasta
   tokens de LLM na etapa de extração.
7. `ai_calls` tem uma linha por chamada com custo > 0 e o produto correto.
8. `job_runs` mostra `started → completed`; matar o job no meio deixa `failed`, não um registro órfão.
9. Uma URL inválida ou inacessível falha com mensagem clara na UI e não deixa o produto num estado
   pela metade.
10. Nenhum arquivo em `src/modules/**` importa `react` ou `next` (verificado por lint no CI).

---

## Testes

- `crawler`: normalização de URL, bloqueio de SSRF, respeito a robots.txt, cache por contentHash.
- `applyProfile`: matriz de merge — campo travado, destravado, novo campo, campo removido pela IA.
- `AIProvider`: saída inválida → um retry → erro duro; `ai_calls` gravado nos três casos.
- Idempotência: dois disparos concorrentes da mesma análise produzem uma única versão de perfil.

---

## Retrospectiva (implementado em 2026-08-16)

### Verificado automaticamente

| # | Critério | Como foi verificado |
|---|---|---|
| 1 | Migration roda do zero e sobre banco populado | Postgres 16 em container: 11 tabelas + `pg_trgm`; reexecução é no-op e preserva dados |
| 5 | Edição humana sobrevive à reanálise | Teste de integração `edição humana sobrevive a uma reanálise forçada` |
| 6 | Reanálise sem mudança não gera versão nem gasta token | Teste de integração; contador de chamadas do provider falso fica em zero |
| 8 | `job_runs` reflete o ciclo do job | Testes de claim concorrente e de retomada de job falho |
| 9 | URL inacessível falha limpo | Teste de integração: produto vai a `failed`, sem perfil pela metade |
| 10 | Domínio não importa React/Next | Regra de lint verificada com arquivo-sonda; dispara como esperado |

64 testes passando (`pnpm test`), build de produção OK, lint sem avisos, `tsc --noEmit` limpo.

### Implementado, mas ainda não verificado de ponta a ponta

Estes quatro precisam de credenciais reais (GitHub OAuth e Anthropic) e ficam para a primeira
sessão de uso real:

| # | Critério | O que falta |
|---|---|---|
| 2 | Login com allowlist | A guarda de rota foi verificada (`/` e `/products` redirecionam com 307); o fluxo OAuth em si exige um app do GitHub |
| 3 | Cadastro responde em < 1s | O despacho não bloqueia por construção, mas não foi cronometrado com LLM real |
| 4 | Perfil com campos preenchidos ou `null` | Verificado com provider falso; falta rodar contra três SaaS reais |
| 7 | `ai_calls` com custo > 0 por chamada | O provider falso não passa por `insertAiCall`, então só a primeira chamada real prova este caminho |

### Desvios do plano

- **SDK oficial da Anthropic no lugar do Vercel AI SDK.** `messages.parse()` com
  `zodOutputFormat` já entrega structured outputs validados por Zod, então o AI SDK viraria
  uma camada a mais sem capacidade a mais. A interface `AIProvider` continua sendo o ponto
  de troca de modelo.
- **Conexão de banco preguiçosa.** A versão inicial abria conexão no import, o que quebrava
  testes de função pura. Virou um Proxy — que precisou de um trap `getPrototypeOf` porque o
  adapter do Auth.js identifica o dialeto por `instanceof`.
- **Vitest 3, não 4.** A v4 exige Node ≥ 22; o ambiente roda Node 21.
- **Sem componente de diff dedicado.** O histórico de versões lista quais campos mudaram
  entre versões, em vez de renderizar um diff textual. Cumpre a auditoria a um custo menor.
- **`pricingTiers` é somente leitura.** É o único campo estruturado; editá-lo pediria um
  formulário próprio que a Fase 0 não precisa.

---

## Não avance para a fase 1 antes de

- ter rodado a análise em pelo menos 3 SaaS reais (incluindo os seus) e o perfil estar bom o
  suficiente para você conseguir escrever conteúdo a partir dele **manualmente**;
- se o perfil não sustenta conteúdo escrito à mão, ele também não vai sustentar conteúdo de IA — o
  problema é do prompt de inferência, não do motor de conteúdo que ainda não existe.
