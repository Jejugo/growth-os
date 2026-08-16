# Fase 2 — Distribuição

> **Marco:** um canal real publica de forma majoritariamente autônoma, sem nunca duplicar uma
> publicação e sem nunca postar no produto errado.

---

## Estado atual (esperado ao entrar na fase)

Conteúdo aprovado existe no banco, por canal, com veredito de risco. Nada sai da aplicação.

---

## Objetivo

Levar conteúdo aprovado até uma plataforma real, com as garantias da seção 30: validação,
rate limit, retries, chave de idempotência, log de auditoria, política de automação e kill switch.

Esta é a fase de maior risco de dano irreversível do projeto inteiro. Um post duplicado ou postado
na conta errada não tem `undo`. A prioridade aqui é correção, não velocidade.

---

## Escopo

### Dentro

- abstração `DistributionChannel` + registro de adapters
- **Bluesky** como primeiro adapter completo (API aberta, app passwords, sem fila de aprovação de
  parceria — é o único canal com custo de acesso previsível)
- **LinkedIn** como adapter atrás de flag, dependente de acesso à API; se o acesso não vier, opera
  em modo `manual_assist` (gera o texto final e registra a publicação, o humano cola)
- **Reddit** apenas geração de rascunho, sem publicação (seção 12)
- políticas de automação por produto × canal
- agendamento com o planner da seção 15 (cron acorda, planner decide)
- máquina de estados de publicação com estado `unknown` e reconciliação
- geração de UTM na hora da publicação (o link de tracking completo vem na fase 3)
- histórico de publicação e trilha de auditoria
- kill switch em três níveis

### Fora

Instagram, Mastodon, newsletter, blog, publicação em comunidade, comentários, qualquer engajamento.

---

## Mudanças de banco

```ts
channel_accounts {
  id, productId,
  channel enum('bluesky','linkedin','reddit'),
  handle text,                        // identidade real e visível
  displayName text,
  credentials bytea,                  // cifrado (AES-GCM, chave em env), nunca em log
  credentialsExpiresAt?,
  status enum('active','paused','error','revoked'),
  lastErrorAt?, lastErrorMessage?,
  createdAt, updatedAt
  unique(productId, channel, handle)
}

automation_policies {
  id, productId, channel,
  level enum('automatic','approval_required','suggestions_only'),
  maxPostsPerDay int,
  minMinutesBetweenPosts int,
  allowedHours jsonb,                 // janelas por dia da semana, em tz do produto
  killSwitch boolean default false,
  updatedAt
  unique(productId, channel)
}

publications {
  id, productId, postId, channelAccountId,
  idempotencyKey text unique,         // sha256(postId + channelAccountId + scheduledFor)
  status enum('scheduled','publishing','published','failed','unknown','cancelled'),
  scheduledFor timestamptz,
  publishedAt?,
  externalId text?,                   // id/uri do post na plataforma
  externalUrl text?,
  attemptCount int default 0,
  lastError jsonb?,
  createdAt, updatedAt
  index(productId, status, scheduledFor)
}

publication_attempts {
  id, publicationId,
  attemptNo int, startedAt, endedAt,
  request jsonb,                      // sanitizado, sem credenciais
  responseStatus int?, response jsonb?,
  outcome enum('success','retryable_error','permanent_error','unknown'),
}

rate_limit_state {
  channelAccountId pk, windowStartsAt, requestCount,
  backoffUntil?, updatedAt
}
```

`social_posts` ganha `publicationId?` e o status `scheduled`/`published` passa a ser derivado da
publicação — o post não guarda estado de publicação duplicado.

---

## Mudanças de backend

### 1. Interface de canal

```ts
interface DistributionChannel {
  readonly channel: ChannelId
  getCapabilities(): ChannelCapabilities   // maxChars, links, mídia, threads, formatação
  validate(content: RenderedContent): ValidationResult
  publish(content: RenderedContent, ctx: PublishContext): Promise<PublicationResult>
  fetchRecent(account: ChannelAccount, since: Date): Promise<ExternalPost[]>  // reconciliação
}
```

`fetchRecent` é obrigatório e é o que torna o estado `unknown` resolvível. Um canal sem forma de
consultar o que foi publicado não pode operar em modo `automatic` — no máximo `approval_required`
com confirmação humana.

`PublicationResult`: `{ outcome: 'success'|'retryable'|'permanent'|'unknown', externalId?, externalUrl?, error? }`.
Um timeout ou 5xx **nunca** é `retryable` — é `unknown`.

### 2. Motor de publicação — `modules/distribution/publisher.ts`

Sequência, sem atalhos:

```text
1. carrega publicação; exige status 'scheduled'
2. re-checa kill switch (global → produto → canal)     ← imediatamente antes, não no início
3. re-checa política de automação e limites de frequência
4. re-checa que post.productId === channelAccount.productId   ← guarda contra postar no produto errado
5. re-checa que o post ainda está 'approved' e não foi editado desde o agendamento
6. renderiza conteúdo + valida contra as capacidades do adapter
7. transação: status 'scheduled' → 'publishing'  (WHERE status='scheduled', 0 linhas = já em curso, aborta)
8. grava publication_attempt: started
9. chama o adapter
10. mapeia resultado:
      success   → published + externalId
      permanent → failed
      retryable → volta a scheduled com backoff, attemptCount++
      unknown   → status 'unknown', SEM retry, enfileira reconciliação
11. registra decision + auditoria
```

O passo 7 é o coração da correção: o claim é um `UPDATE ... WHERE status='scheduled'` — dois
workers concorrentes não conseguem publicar o mesmo post, independentemente do que o Trigger.dev
faça com retries.

### 3. Reconciliação — `trigger/reconcile-publications.ts`

Roda a cada 10 minutos sobre publicações em `unknown` há mais de 2 minutos:

```text
fetchRecent(conta, desde = scheduledFor - 5min)
  → procura o post por marcador de idempotência (hash curto no fim do texto, ou
    correspondência exata de texto + janela temporal)
  → achou   → published + externalId
  → não achou após 3 tentativas em 1 hora → failed (permite reagendamento manual)
  → nunca resolve sozinho para 'republicar'
```

Se o canal não oferecer forma confiável de correspondência, o `unknown` vira uma tarefa de
confirmação humana na UI. Melhor pedir 10 segundos do fundador do que arriscar um post duplicado.

### 4. Planner de agendamento (seção 15)

Cron **não** publica. Cron acorda o planner:

```text
trigger/growth-tick.ts   (a cada hora, por produto)
  1. estado: posts aprovados, publicados hoje/semana, janelas permitidas, políticas
  2. deve agir agora?  → verifica cadência, janela horária, limite diário, kill switch
  3. se não → registra decision NO_ACTION com rationale; termina
  4. se sim → escolhe o melhor post aprovado
       (fase 2: heurística determinística — mais antigo aprovado, respeitando
        rotação de canal e ângulo. Nada de LLM aqui ainda)
  5. cria a publicação como 'scheduled' e enfileira publish-post
```

`NO_ACTION` é logado com o mesmo carinho que uma publicação. É o registro que explica por que o
sistema ficou quieto — e sem ele, "não postou nada hoje" vira um mistério insolúvel.

### 5. Rate limit e backoff

Contador por conta em `rate_limit_state`, com teto configurado **abaixo** do limite oficial da
plataforma. Um 429 pausa a conta até `backoffUntil` e nunca provoca troca de rota, IP ou conta.

### 6. UTM

Na renderização, todo link recebe `utm_source/medium/campaign/content` derivados de canal, campanha
e post. O `ref=` interno e a tabela `tracking_links` chegam na fase 3 — aqui o link ainda aponta
direto para o destino, só com UTMs.

---

## Mudanças de UI

- `/products/[id]/channels` — contas conectadas, conectar/desconectar, status e último erro.
- Política por canal: nível de automação, máximo por dia, janelas de horário, **kill switch** com
  destaque visual.
- Kill switch global no header, sempre visível e a um clique.
- `/products/[id]/content` ganha visão de **calendário** com o que está agendado.
- `/products/[id]/publications` — histórico: status, tentativas, erro, link externo, e uma fila
  destacada de itens em `unknown` aguardando confirmação humana.

---

## Integrações externas

- **Bluesky** (`@atproto/api`): autenticação por app password, `createRecord` para post,
  `getAuthorFeed` para reconciliação. Limite de 300 grafemas — validado pelo adapter.
- **LinkedIn**: API de posts de organização/membro requer aprovação de produto. Se indisponível, o
  adapter entrega `manual_assist`: texto final + registro da publicação após confirmação manual.
- **Reddit**: nenhuma chamada de escrita nesta fase.

---

## Riscos

| Risco | Mitigação |
|---|---|
| Publicação duplicada | Claim transacional + `idempotencyKey` unique + `unknown` sem retry |
| Post no produto/conta errada | Checagem de `productId` no publisher **e** no adapter; teste dedicado |
| Credenciais vazando em log | Cifradas em repouso; sanitização de request/response antes de gravar; regra de lint contra logar o objeto de conta |
| Token expira em silêncio | `credentialsExpiresAt` + verificação de saúde diária + conta vai a `error` com aviso na UI |
| Autonomia agressiva demais no começo | Começar **todo** canal em `approval_required`. Promover a `automatic` só após 2 semanas sem incidente |
| API do LinkedIn não sair | Bluesky sozinho cumpre o critério da fase; LinkedIn em `manual_assist` não bloqueia o roadmap |

---

## Critérios de aceite

1. Um post aprovado é publicado no Bluesky e o `externalUrl` aparece no histórico.
2. Disparar `publish-post` duas vezes em paralelo para a mesma publicação resulta em **um** post na
   plataforma (teste com adapter falso e, depois, uma vez em conta real de teste).
3. Um timeout simulado deixa a publicação em `unknown`, **não** republica, e a reconciliação a
   resolve corretamente nos dois cenários (post existe / não existe).
4. Kill switch acionado durante um job impede a chamada externa, mesmo com o job já em execução.
5. Fora da janela de horário permitida, o tick registra `NO_ACTION` com motivo legível.
6. Estourar o limite diário impede novas publicações e é visível na UI.
7. Um post com 400 grafemas é rejeitado pela validação do adapter antes de qualquer chamada de rede.
8. Todo link publicado carrega os quatro parâmetros UTM corretos.
9. O histórico de auditoria permite reconstruir, para qualquer post publicado: quando, por qual
   conta, com quantas tentativas e por qual decisão.

---

## Testes

- Máquina de estados de publicação: toda transição válida e inválida, incluindo `unknown`.
- Concorrência: dois publishers na mesma publicação → um publica, outro aborta limpo.
- Reconciliação: post encontrado, não encontrado, encontrado depois de duas tentativas.
- Rate limit: contagem por janela, 429 → backoff, retomada após o backoff.
- Guarda de produto: publicação com conta de outro produto lança erro e não chama a rede.
- Adapter Bluesky com servidor HTTP falso: sucesso, 429, 500, timeout.

---

## Porta de saída

Duas semanas de publicação em conta real, com política `approval_required`, sem uma única duplicata
e sem uma publicação em `unknown` não resolvida. Só então mude um canal para `automatic`.
