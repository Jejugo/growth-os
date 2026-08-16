# GrowthOS

Plataforma autônoma de crescimento e distribuição para produtos SaaS. Ferramenta interna:
um fundador, vários produtos. A especificação está em [`init.md`](./init.md) e o plano de
implementação em [`docs/plans/`](./docs/plans/).

**Estado: Fase 0 (Fundação) implementada.** Marco atual — colar a URL de um SaaS, a aplicação
lê o site e cria um Product Profile persistente e editável.

---

## Como rodar

Requer Node ≥ 20.9 e pnpm. Um Postgres local (Docker serve) e uma chave da Anthropic.

```bash
pnpm install
cp .env.example .env        # preencha os valores (veja abaixo)
pnpm db:up                  # sobe o Postgres e espera ficar saudável
pnpm db:migrate
pnpm dev
```

### Variáveis obrigatórias

| Variável | Onde conseguir |
|---|---|
| `DATABASE_URL` | Neon, ou o Postgres do compose: `postgresql://postgres:postgres@localhost:55432/growthos` |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` | GitHub → Settings → Developer settings → OAuth Apps. Callback: `http://localhost:3000/api/auth/callback/github` |
| `AUTH_ALLOWED_EMAILS` | Seu e-mail. Quem não estiver na lista não entra. |
| `ANTHROPIC_API_KEY` | console.anthropic.com |

`TRIGGER_SECRET_KEY` é opcional: sem ele, a análise roda em background no próprio processo
(bom para desenvolver, não sobrevive a restart). Com ele, quem executa é o Trigger.dev.

### Comandos

```bash
pnpm dev          # servidor de desenvolvimento
pnpm test         # 64 testes (os de integração precisam de DATABASE_URL)
pnpm typecheck    # tsc --noEmit
pnpm lint         # inclui as regras de fronteira de módulo
pnpm build        # build de produção

pnpm db:up        # sobe o Postgres (docker compose, espera o healthcheck)
pnpm db:down      # para o Postgres — os dados ficam no volume
pnpm db:reset     # apaga o volume, recria e migra do zero
pnpm db:generate  # gera migration a partir do schema
pnpm db:migrate   # aplica migrations
pnpm db:studio    # inspeciona o banco
```

O `docker-compose.yml` sobe **só o Postgres**. A aplicação roda no host com `pnpm dev` —
mais rápido, hot-reload sem bind mount, e não há nada a ganhar containerizando um processo
Node em desenvolvimento. Não há `Dockerfile` de produção porque o alvo de deploy é a Vercel;
se isso mudar (Fly, Railway, VPS, ou Trigger.dev auto-hospedado), aí ele passa a fazer sentido.

---

## Arquitetura em cinco minutos

```
app/                  rotas Next (App Router) — só UI e server actions finas
src/
  modules/            domínio, um diretório por área
    ai/               AIProvider, roteamento de tier, contabilidade de custo
    products/         URL, crawler, extração, análise, perfis versionados
    missions/         tabela vazia até a Fase 5 (existe para fixar FKs cedo)
    auth/             tabelas do Auth.js
  lib/                db, env, ids, observabilidade
  server/             composition root: auth, guarda de sessão, dispatch de jobs
  trigger/            tasks do Trigger.dev (cascas finas)
drizzle/              migrations SQL
tests/                unidade + integração
```

Três regras que o lint impõe, não só a convenção:

- `src/modules/**` e `src/lib/**` nunca importam `react` ou `next`.
- `app/**` importa módulos pelo `index.ts`, nunca `repo.ts` ou `schema.ts` direto.
- Nenhuma chamada de LLM acontece fora de `modules/ai`.

### O fluxo da Fase 0

```
URL colada
   ↓  normalizeProductUrl (https, sem query, sem barra final) + guarda de SSRF
crawl educado (robots.txt, ≤6 páginas, 1 req/s, 10s de timeout)
   ↓  snapshots com contentHash — conteúdo igual não vira linha nova
extração factual        tier cheap   (Haiku 4.5)   → o que o site literalmente diz
   ↓
inferência de posicionamento  tier strong (Opus 5) → problema, ICP, diferenciais
   ↓  validação factual: schema Zod + verificação contra os fatos
merge com lockedFields  → campos editados à mão sobrevivem
   ↓
nova versão do perfil + decisão registrada
```

### Duas coisas que valem entender antes de mexer

**`lockedFields`.** Editar um campo no painel o adiciona a essa lista, e nenhuma análise
futura o sobrescreve — a versão nasce como `merged`. Há um botão explícito para destravar.
É o que torna o perfil confiável: a IA erra, você corrige, e a correção fica.

**Custo.** Toda chamada de LLM grava uma linha em `ai_calls`, inclusive as que falharam, com
tokens e custo em `numeric(12,6)`. Um teto mensal por produto
(`AI_MONTHLY_BUDGET_USD_PER_PRODUCT`) é verificado antes de cada chamada; estourado, o job
aborta e registra a decisão em vez de continuar gastando.

---

## Roteamento de modelo

| Tier | Modelo | Uso |
|---|---|---|
| `cheap` | Haiku 4.5 | extração factual, classificação, tagging |
| `standard` | Sonnet 5 | redação, adaptação por canal (Fase 1) |
| `strong` | Opus 5 | estratégia, posicionamento, decisões de risco |

O mapa vive em `src/modules/ai/config.ts` e é a única fonte. Lógica de negócio escolhe o
tier, nunca o nome do modelo.

---

## O que a Fase 0 deliberadamente NÃO tem

Audiências, campanhas, conteúdo, canais, agendamento, atribuição, missões com lógica. Nada
disso deve ser adicionado antes da fase correspondente — veja
[`docs/plans/README.md`](./docs/plans/README.md).
