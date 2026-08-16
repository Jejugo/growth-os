# GrowthOS — Arquitetura de referência e roadmap

Documento transversal. Define o que vale para **todas** as fases. As decisões aqui só mudam com
uma justificativa explícita registrada na seção "Decisões" no fim deste arquivo.

---

## 1. Princípio arquitetural central

O `init.md` descreve um sistema autônomo enorme. A armadilha óbvia é construir a abstração do
sistema final antes de ter o sistema mínimo funcionando. A regra que resolve isso:

> **Modele o domínio para o GrowthOS completo. Implemente apenas a fase atual.**

Na prática: as *tabelas e os limites de módulo* antecipam o futuro (é caro migrar dados e refatorar
fronteiras depois). O *comportamento* não antecipa nada — nada de motor de estratégia, bandit ou
scoring antes da fase que precisa deles.

Duas consequências concretas:

- `campaigns`, `missions` e `experiments` existem como tabelas cedo, mesmo que na fase 1 uma
  campanha seja só um agrupador manual. Isso evita reescrever as FKs de todo o conteúdo depois.
- Nenhum arquivo `strategy-engine.ts` vazio "para o futuro". Abstração só nasce no segundo caso de
  uso real (seção 30, prioridade 5).

---

## 2. Stack

| Camada | Escolha | Por quê |
|---|---|---|
| App | Next.js (App Router) + TypeScript + React | Sugerido no `init.md`; RSC evita uma camada de API só para a UI |
| DB | PostgreSQL no Neon | Branching de banco por preview é útil para migrations arriscadas |
| ORM | **Drizzle** | Schema em TS versionado junto do módulo; migrations SQL legíveis e revisáveis — importante dado o requisito "migrations preservam dados" |
| Jobs | **Trigger.dev v4** | Workflows longos, retries, idempotência e observabilidade sem infra própria. Funções serverless não bastam: análise de produto e ticks de planner passam do limite de duração |
| LLM | **SDK oficial da Anthropic** atrás de uma interface `AIProvider` própria | `messages.parse()` + `zodOutputFormat` dão structured outputs validados por Zod nativamente; a interface própria mantém a regra "não acoplar lógica de negócio a um modelo" |
| Analytics de produto | PostHog | Dashboards e funil interno; **não** é a fonte de verdade de atribuição |
| Erros | Sentry | — |
| Deploy | Vercel | — |
| Auth | Auth.js v5, um único provider OAuth + allowlist de e-mail | Ferramenta interna de um fundador. Sem times, sem papéis, sem billing |
| Testes | Vitest (domínio) + Playwright só a partir da fase 3 | — |

**Proibido sem justificativa escrita** (seção 24): Kafka, Kubernetes, microserviços, banco vetorial
dedicado, serviço Python separado, fila própria.

Sobre banco vetorial: a deduplicação de conteúdo da fase 1 usa `pg_trgm` + hashes normalizados, não
embeddings. Se semântica virar necessidade real, a resposta é `pgvector` **no mesmo Postgres** —
não é um banco novo.

---

## 3. Estrutura de pastas

```text
/app                      # rotas Next.js — apenas UI e server actions finas
  /(dashboard)/...
  /r/[code]/route.ts      # redirect de tracking (fase 3)
  /api/events/route.ts    # ingestão de eventos externos (fase 3)

/src
  /modules
    /products             # ProductProfile, crawling
    /missions             # GrowthMission (fase 5; tabela desde a fase 0)
    /audiences            # AudienceSegment
    /campaigns            # Campaign, ContentTheme
    /content              # ContentIdea, ContentAsset, SocialPost, memória de conteúdo
    /distribution         # DistributionChannel, adapters, agendamento, publicação
    /attribution          # TrackingLink, GrowthEvent, resolução de atribuição
    /analytics            # rollups, funil, relatórios
    /experiments          # experimentos e leitura de resultados
    /opportunities        # descoberta (fase 6)
    /ai                   # AIProvider, roteamento de modelo, prompts, custo
    /integrations         # clientes HTTP crus (Bluesky, LinkedIn, ...)
  /lib
    /db                   # cliente Drizzle, helpers de transação
    /jobs                 # utilidades de idempotência, locks
    /observability        # logger, decision log, tracing
  /server                 # composition root: DI simples, config, feature flags

/trigger                  # definições de task do Trigger.dev (cascas finas)
/drizzle                  # migrations geradas
/docs/plans               # este plano
```

Cada módulo tem a mesma forma:

```text
/modules/<nome>
  schema.ts      # tabelas Drizzle deste módulo
  types.ts       # tipos de domínio + schemas Zod
  repo.ts        # acesso a dados — a ÚNICA camada que fala com o Drizzle
  service.ts     # lógica de domínio, sem React, sem Next
  ai/*.ts        # prompts + chamadas LLM focadas deste módulo (quando houver)
  index.ts       # superfície pública do módulo
```

Regras de dependência (verificadas por lint no CI a partir da fase 1):

- `app/**` pode importar `modules/*/index.ts` — nunca `repo.ts` direto.
- Módulo A importa módulo B **apenas** pelo `index.ts` de B.
- `modules/**` nunca importa nada de `app/**` nem de `react`.
- `trigger/**` só orquestra: toda regra vive em `service.ts`.

---

## 4. Camada de IA

### 4.1 Interface

```ts
type ModelTier = 'cheap' | 'standard' | 'strong'

interface AIProvider {
  generateStructured<T>(opts: {
    task: string                 // 'product.analyze' — usado para custo e logs
    tier: ModelTier
    schema: ZodSchema<T>
    system: string
    prompt: string
    context: AICallContext       // productId, missionId, campaignId, ...
    maxRetries?: number
  }): Promise<AIResult<T>>

  generateText(opts: { /* idem, sem schema */ }): Promise<AIResult<string>>
}
```

Toda chamada retorna `AIResult` com `{ data, usage, costUsd, model, latencyMs, callId }` e grava uma
linha em `ai_calls`. Não existe chamada de LLM fora desta interface.

### 4.2 Roteamento de modelo (seção 22)

| Tier | Modelo | Usos |
|---|---|---|
| `cheap` | Haiku 4.5 (`claude-haiku-4-5-20251001`) | classificação, tagging, limpeza de HTML, categorização, detecção de duplicata, reescrita mecânica |
| `standard` | Sonnet 5 (`claude-sonnet-5`) | redação de posts, adaptação por canal, resumos |
| `strong` | Opus 5 (`claude-opus-5`) | estratégia de crescimento, raciocínio de audiência, planejamento de campanha, leitura de experimentos, decisões de risco em comunidades |

O tier é escolhido no código chamador, nunca pelo LLM. O mapa tier → modelo fica em um único
arquivo de config para poder mudar sem tocar em lógica de negócio.

### 4.3 Serviços de IA (seção 21)

Cada "serviço de IA" é **uma função TypeScript comum** que monta contexto do banco, chama o
`AIProvider` com um schema Zod e valida o resultado contra o estado real. Não são agentes autônomos.

```text
Product Analyst   → modules/products/ai/analyze-product.ts        (fase 0)
Audience Analyst  → modules/audiences/ai/derive-segments.ts       (fase 1)
Content Planner   → modules/campaigns/ai/plan-campaign.ts         (fase 1)
Content Writer    → modules/content/ai/write-post.ts              (fase 1)
Risk Reviewer     → modules/content/ai/review-risk.ts             (fase 1)
Channel Adapter   → modules/distribution/ai/adapt-to-channel.ts   (fase 2)
Performance Analyst → modules/analytics/ai/summarize-performance.ts (fase 4)
Growth Strategist → modules/missions/ai/plan-week.ts              (fase 5)
Opportunity Analyst → modules/opportunities/ai/score-opportunity.ts (fase 6)
```

### 4.4 Validação de saída (seção 31, regras 7 e 8)

Passar o schema Zod **não é validação suficiente**. Depois do parse, toda saída passa por uma
verificação de fatos contra o banco:

- IDs referenciados existem e pertencem ao mesmo `productId`;
- URLs estão em domínios permitidos (domínio do produto, ou fontes já registradas);
- capacidades de canal (limite de caracteres, mídia, links) vêm do adapter, nunca do LLM;
- enums são reconferidos contra os valores do domínio;
- nada que o LLM escreveu vira ID no banco — IDs são sempre gerados por nós.

Falha de validação → `ai_calls.status = 'invalid'`, um retry com o erro no prompt, depois erro duro.

### 4.5 Versionamento de prompt

Todo prompt tem `promptVersion` (string semântica, ex. `product.analyze@3`) gravada na chamada e no
artefato produzido. Isso permite: chaves de idempotência corretas, reprocessar só o que usou uma
versão ruim, e comparar qualidade entre versões.

---

## 5. Modelo de dados (visão consolidada)

Todas as tabelas: `id` (uuid v7, gerado pela app), `createdAt`, `updatedAt`. Quase todas carregam
`productId` — é o eixo de particionamento lógico e de toda checagem de autorização.

```text
FASE 0
  users, sessions                     auth
  products                            id, name, url, status
  product_profiles                    versionado; JSONB + colunas de campos-chave
  product_crawl_snapshots             HTML/texto bruto + contentHash
  ai_calls                            task, promptVersion, model, tokens, custo, status
  job_runs                            espelho local dos runs, com idempotencyKey
  decisions                           log de decisões autônomas (rationale + evidências)

FASE 1
  audience_segments
  missions                            criada aqui, ativada de fato na fase 5
  campaigns
  content_themes
  content_ideas
  content_assets                      artefato "mãe" (artigo, pesquisa, dataset)
  social_posts                        post específico de plataforma + máquina de estados
  content_fingerprints                dedupe: hashes de hook/argumento/CTA
  content_feedback                    aprovações, rejeições, motivo

FASE 2
  channel_accounts                    credenciais (cifradas), handle, canal
  automation_policies                 por produto × canal: automatic | approval | suggest
  publications                        tentativa de publicação, idempotencyKey, externalId
  publication_attempts                cada chamada externa, com resultado

FASE 3
  tracking_links
  growth_events                       click, signup, activation, paid
  visitors                            visitorId anônimo → userId externo
  ingest_keys                         chave por produto para o endpoint de eventos

FASE 4
  performance_rollups                 métricas agregadas por dimensão × janela
  learnings                           aprendizado gerado por IA + evidências + confiança

FASE 5
  mission_plans                       plano semanal: alocação por canal/tema + budget de exploração
  allocations                         resultado da alocação, com fatia de exploração

FASE 6
  opportunities
  community_profiles
  sources                             feeds/comunidades/criadores monitorados

FASE 7
  audience_clusters, creator_profiles, affinity_scores

TRANSVERSAL
  experiments, experiment_variants, experiment_exposures   (tabelas na fase 1, motor na fase 4)
  cost_events                         custos não-LLM (crawling, APIs, imagens)
```

Convenções:

- Dinheiro em `numeric(12,6)` (custos de LLM são frações de centavo). Nunca float.
- Timestamps `timestamptz`, sempre UTC. Fuso só na renderização.
- Estados como enum do Postgres, não string livre.
- Toda tabela com `productId` tem índice `(productId, createdAt desc)`.
- Soft delete só onde existir motivo (conteúdo rejeitado, para o dedupe lembrar dele).

---

## 6. Jobs, idempotência e segurança de execução

### 6.1 Padrão

```text
Cron / evento
     ↓
Task do Trigger.dev  (casca fina)
     ↓
service.ts           (toda a regra; testável sem Trigger)
     ↓
efeito externo       (só via adapter, sempre com idempotencyKey)
```

### 6.2 Idempotência (seção 30, prioridade 1)

Três mecanismos distintos, para três problemas distintos:

1. **Deduplicação de trigger** — `idempotencyKey` do Trigger.dev evita que o mesmo cron/webhook
   dispare dois runs. Chave determinística: `growth-tick:${productId}:${isoWeek}`.
2. **Deduplicação de efeito** — antes de qualquer chamada externa, um `INSERT` numa tabela de
   claim com unique constraint (`publications.idempotencyKey`). Quem perde a corrida não publica.
3. **Reconciliação de resultado desconhecido** — timeout ou 5xx **não** é retry automático. A
   publicação vai para `unknown` e um job de reconciliação consulta o canal (pelo marcador de
   idempotência ou pelo timeline recente da conta) para decidir `published` ou `failed`.
   *Nunca retry cego de publicação.*

### 6.3 Máquina de estados de publicação

```text
draft → pending_approval → approved → scheduled → publishing ─┬→ published
                                                              ├→ failed        (retry seguro)
                                                              └→ unknown       (só reconciliação)
qualquer estado → cancelled
```

Transições só via função `transition(publication, event)` com tabela de transições válidas. Testada
exaustivamente. Um `UPDATE` de status fora dessa função é bug — o lint proíbe.

### 6.4 Kill switch

Três níveis, checados **imediatamente antes** de cada chamada externa (não no início do job):
global (env + flag no banco) → produto → canal. Desligar é instantâneo e não requer deploy.

### 6.5 Observabilidade (seção 30, prioridade 3)

Todo workflow emite `started | completed | failed | retried | cancelled` em `job_runs`, com
`productId` e correlação. Toda decisão autônoma relevante grava em `decisions`:

```ts
{ productId, actor: 'planner'|'writer'|'risk-reviewer'|'human',
  decision: 'POST'|'NO_ACTION'|'REJECT'|..., rationale, inputsSnapshot, aiCallId, createdAt }
```

O log de decisão é o que torna o sistema depurável quando ele começar a agir sozinho. É requisito,
não enfeite.

### 6.6 Custo (seção 30, prioridade 4)

`ai_calls` + `cost_events` são agregados por produto / campanha / missão. A partir da fase 3 dá para
calcular `custo de infraestrutura de crescimento ÷ clientes adquiridos`. Alerta de orçamento por
produto desde a fase 0 (um crawl em loop pode custar caro sem ninguém perceber).

---

## 7. Segurança e comportamento na plataforma

Traduzindo as proibições da seção 1 para restrições que o código impõe — não só para o prompt:

| Regra | Como é imposta |
|---|---|
| Sem spam | Rate limit por canal **abaixo** do limite oficial; máximo de posts/dia por conta em config, não em prompt |
| Sem engajamento artificial | Nenhum adapter expõe `follow`, `like` ou `vote`. A capacidade simplesmente não existe no código |
| Sem personas falsas | Uma conta = uma identidade real, declarada em `channel_accounts.handle`. Sem criação de contas |
| Sem comentários repetitivos | O gate de dedupe roda em comentários também, não só em posts |
| Sem link indiscriminado | Política de link é por comunidade (`community_profiles.linkPolicy`) e o validador bloqueia antes de publicar |
| Respeito à moderação | Nenhum código de contorno de rate limit; 429 → backoff e pausa da conta, nunca troca de rota |
| Crawling educado | User-agent identificável, respeito a `robots.txt`, no máximo N páginas por domínio, cache por `contentHash` |

`NO_ACTION` é um resultado de primeira classe do planner, com seu próprio caminho de log e UI
(seção 14). Se em uma semana o sistema não decidir `NO_ACTION` nenhuma vez, o planner provavelmente
está quebrado.

---

## 8. Sequenciamento

```text
Fase 0  Fundação          ~1–2 semanas    ← porta: perfil de produto estável e editável
Fase 1  Conteúdo          ~2–3 semanas    ← porta: uma semana coerente de conteúdo
Fase 2  Distribuição      ~2 semanas      ← porta: um canal publicando sozinho, sem duplicatas
Fase 3  Atribuição        ~1–2 semanas    ← porta: signups atribuídos a posts
Fase 4  Aprendizado       ~2 semanas      ← porta: o conteúdo muda por causa dos dados  ➜ MVP COMPLETO
─────────────────────────────────────────
Fase 5  Missões           ~2–3 semanas
Fase 6  Oportunidades     ~3 semanas
Fase 7  Crescimento aud.  ~3 semanas
Fase 8  Autonomia         contínuo
```

Estimativas para um dev com IA, em tempo integral. Servem para ordenar, não para prometer.

**Regra de porta:** entre fases, o sistema roda por pelo menos uma semana em uso real antes de
começar a próxima. O objetivo é gerar dados e desconfortos reais que reescrevem o plano da fase
seguinte. Esse tempo de uso é parte do plano, não atraso.

---

## 9. Riscos transversais

| Risco | Impacto | Mitigação |
|---|---|---|
| Acesso a API do LinkedIn é restrito | Fase 2 sem o canal mais relevante para B2B | Bluesky é o canal V1 obrigatório; LinkedIn entra como adapter "approval required" com publicação assistida se a API não vier |
| Conteúdo LLM genérico e repetitivo | Produto inútil, mesmo funcionando | Dedupe determinístico + rotação forçada de formato + memória de conteúdo no prompt (fase 1) |
| Publicação duplicada ou na conta errada | Dano irreversível de reputação | Claim com unique key + estado `unknown` + `productId` checado no adapter + dry-run obrigatório em staging |
| Atribuição errada leva o aprendizado ao lugar errado | Sistema aprende a coisa errada com confiança | Testes de atribuição desde o dia 1; janela de atribuição explícita; "não atribuído" é uma categoria visível, não um resto escondido |
| Volume de dados baixo demais para aprender | Aprendizados que são ruído | Limiares mínimos de amostra antes de virar recomendação; abaixo disso é "hipótese", nunca "aprendizado" |
| Custo de LLM sai do controle | — | Tier routing + cache de crawl + orçamento por produto com corte automático |
| Escopo cresce (seção 29) | Nunca chega ao MVP | Lista de não-objetivos revisada no início de cada fase; qualquer item novo entra numa lista "fase 9+", não na atual |

---

## 10. Decisões

Registrar aqui toda decisão arquitetural com data e motivo. Formato:
`YYYY-MM-DD — Decisão — Motivo — Alternativa descartada`.

- 2026-08-16 — Drizzle em vez de Prisma — schema colocado dentro do módulo e migrations SQL
  revisáveis à mão, o que importa dado o requisito de preservar dados — Prisma.
- 2026-08-16 — Trigger.dev em vez de cron da Vercel — análise de produto e ticks de planner são
  longos e precisam de retry/idempotência de primeira classe — Vercel Cron + functions.
- 2026-08-16 — Dedupe por `pg_trgm` + hashes, sem embeddings — evita banco vetorial na fase 1 e
  resolve o caso real (repetir hook/CTA/argumento) — pgvector.
- 2026-08-16 — Atribuição própria (`/r/[code]` + endpoint de ingestão) em vez de depender do
  PostHog do produto promovido — o SaaS promovido é externo e pode não ter PostHog; PostHog fica
  como destino secundário — usar só PostHog.
- 2026-08-16 — SDK oficial da Anthropic em vez do Vercel AI SDK — `messages.parse()` com
  `zodOutputFormat` entrega structured outputs validados por Zod nativamente, então o AI SDK
  seria uma camada de abstração a mais sem capacidade a mais; a interface `AIProvider` própria
  já é o ponto de troca que o plano exigia — Vercel AI SDK.
- 2026-08-16 — Conexão de banco preguiçosa (Proxy em `lib/db`) — sem isso, importar qualquer
  módulo num teste de função pura abriria conexão e exigiria `DATABASE_URL`. O Proxy precisa do
  trap `getPrototypeOf` porque o adapter do Auth.js identifica o dialeto por `instanceof` —
  cliente inicializado no import.
- 2026-08-16 — Vitest fixado na v3 — a v4 usa `rolldown`, que chama `util.styleText` com array
  de formatos e exige Node ≥ 22; a v3 roda no Node 21 do ambiente atual. Revisar ao subir o Node
  — Vitest 4.
- 2026-08-16 — `docker-compose.yml` com o Postgres apenas, sem `Dockerfile` da aplicação — o
  compose fixa a versão do banco e dá volume nomeado (um `docker run` avulso deixa os dados num
  volume anônimo, órfão ao remover o container); um Dockerfile de produção, com deploy na
  Vercel, seria infra que ninguém executa e que apodrece em silêncio. Reavaliar se o alvo de
  deploy sair da Vercel ou se o Trigger.dev for auto-hospedado — containerizar tudo agora.
- 2026-08-16 — `effort` não é enviado para Haiku 4.5 e `thinking` não é enviado para modelos que
  não o suportam; o mapa por tier em `modules/ai/config.ts` codifica isso como dado — Haiku 4.5
  retorna 400 ao receber `effort`, e espalhar `if (model === ...)` pela base seria pior.
