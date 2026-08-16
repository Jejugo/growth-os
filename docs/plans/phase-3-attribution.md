# Fase 3 — Atribuição

> **Marco:** eu sei qual post gerou quais cliques e quais signups.

---

## Estado atual (esperado ao entrar na fase)

Conteúdo é publicado em um canal real com UTMs. Nenhum dado volta: o sistema publica no escuro.

---

## Objetivo

Fechar a metade do loop que falta: `post → clique → signup`. Sem isso, a fase 4 não tem o que
aprender e o sistema inteiro é um gerador de conteúdo caro.

Detalhe estrutural importante: o SaaS promovido é **externo** ao GrowthOS (Orbit Jobs, Clinic SaaS).
A atribuição precisa atravessar essa fronteira, e é isso que define a arquitetura desta fase.

---

## Escopo

### Dentro

- links de tracking próprios: `/r/[code]` → redirect 302 com UTMs + `ref`
- modelo de eventos `GrowthEvent` genérico (não acoplado a UI, seção 17)
- identidade de visitante (cookie first-party + fingerprint mínimo, sem rastreamento cross-site)
- endpoint de ingestão para o SaaS promovido reportar signup/ativação/pagamento
- snippet JS mínimo (< 2 KB) e receita de integração server-side
- resolução de atribuição: last-touch com janela, com dados suficientes para outros modelos depois
- analytics de post, campanha, canal e audiência

### Fora

Modelos multi-touch com pesos, atribuição incrementalidade/lift, integração com dados de anúncios,
identity resolution entre dispositivos.

---

## Mudanças de banco

```ts
tracking_links {
  id, productId, campaignId?, postId?, publicationId?,
  code text unique,               // slug curto base62, 8 chars — vai na URL
  destinationUrl text,            // validado: precisa ser do domínio do produto
  generatedUrl text,              // destino + utm_* + ref
  source, medium, campaign, content text,
  ref text,                       // gr_83fa92 — id interno de atribuição
  clickCount int default 0,       // desnormalizado para listagem; verdade fica em growth_events
  createdAt
}

visitors {
  id, productId,
  visitorId text,                 // uuid em cookie first-party do redirecionador
  firstSeenAt, lastSeenAt,
  firstTrackingLinkId?,           // first touch
  lastTrackingLinkId?,            // last touch
  externalUserId text?,           // preenchido no signup, pelo SaaS promovido
  unique(productId, visitorId)
}

growth_events {
  id, productId,
  visitorId text?, externalUserId text?,
  eventType enum('impression','click','signup','activation','paid','churn'),
  campaignId?, postId?, publicationId?, trackingLinkId?, audienceSegmentId?,
  channel text?,
  value numeric(12,2)?,           // MRR/valor, para 'paid'
  attributionModel enum('direct','last_touch','first_touch','none'),
  metadata jsonb,
  occurredAt timestamptz,
  dedupeKey text unique,          // evita evento duplicado em retry do cliente
  index(productId, eventType, occurredAt desc)
}

ingest_keys {
  id, productId, keyHash text, name, lastUsedAt?, revokedAt?, createdAt
}
```

Regra: `growth_events` é **append-only**. Correções entram como novos eventos. Um funil que pode ser
reescrito é um funil em que não dá para confiar.

---

## Mudanças de backend

### 1. Redirecionador — `app/r/[code]/route.ts`

Runtime edge, alvo de p95 < 50 ms:

```text
1. busca o link pelo code (cache em memória/Edge Config; o link é imutável)
2. code inválido → 302 para a home do produto, com log — nunca 404 na cara do visitante
3. lê ou cria o cookie gos_vid (first-party, 90 dias, SameSite=Lax, Secure)
4. grava um evento 'click'  (fire-and-forget com waitUntil, nunca bloqueia o redirect)
5. 302 para generatedUrl, acrescentando ?ref= e vid=
```

Filtro de bots: user-agents conhecidos e prefetchers marcam o evento com `metadata.bot=true` e ele
fica fora dos rollups. Preview de link do Bluesky e do LinkedIn *vai* inflar cliques se isso for
ignorado — e um clique fantasma vira um aprendizado fantasma.

### 2. Ingestão — `app/api/events/route.ts`

`POST` autenticado por `ingest_key` do produto (header `Authorization: Bearer`).

```json
{ "eventType": "signup", "vid": "…", "ref": "…", "externalUserId": "u_123",
  "occurredAt": "…", "dedupeKey": "signup:u_123", "metadata": {} }
```

- valida a chave → resolve `productId` (o cliente **não** escolhe o produto);
- `dedupeKey` unique torna o reenvio seguro;
- resolve atribuição (abaixo) e persiste;
- responde 202 sempre que o evento for aceito ou já conhecido.

Duas formas de integrar o SaaS promovido:

1. **Server-side (recomendado)** — no handler de signup, um `fetch` para o endpoint com o `ref`
   guardado na sessão. Confiável, imune a adblock.
2. **Snippet JS** — captura `ref`/`vid` da URL, guarda em `localStorage`, envia no signup. Mais
   fácil, menos confiável.

Documentar as duas em `docs/integration.md` na entrega da fase.

### 3. Resolução de atribuição — `modules/attribution/resolve.ts`

Determinístico, sem LLM, testado exaustivamente:

```text
tem ref?          → atribuição direct (link de tracking identificado)
senão, tem vid?   → last_touch dentro da janela de 30 dias
senão             → none  ("não atribuído" é uma categoria visível, não um resto escondido)
```

O modelo aplicado fica gravado em cada evento. Trocar de modelo depois é reprocessamento, não
reinterpretação de dados ambíguos.

### 4. Geração de link

Passa a acontecer na renderização da publicação (fase 2): todo link de saída vira `/r/[code]` com
`postId` e `publicationId` amarrados. Um post editado após ter link mantém o mesmo `code` — o
histórico de cliques não pode se partir.

### 5. Analytics — `modules/analytics/queries.ts`

Consultas SQL puras (não LLM): funil por post, por campanha, por canal, por segmento; taxa de
conversão clique→signup; tempo até conversão. Materializar só quando houver lentidão real.

---

## Mudanças de UI

- `/products/[id]/analytics` — funil `canal → visitante → signup → cliente`, tabelas por post,
  campanha e canal, ordenáveis por conversão (não por cliques).
- Card de post no kanban mostra cliques e signups depois de publicado.
- `/products/[id]/settings/tracking` — chave de ingestão, snippet para copiar, teste de conexão
  ("enviar evento de teste") e o estado de saúde da integração.
- Métricas de vaidade (curtidas, impressões) ficam num bloco secundário e recolhido. A hierarquia
  visual segue a lista de prioridade da seção 19.

---

## Riscos

| Risco | Mitigação |
|---|---|
| Preview de link infla cliques | Filtro de bot/prefetch + comparação clique vs. sessão real; eventos de bot excluídos dos rollups |
| SaaS promovido não instrumenta o signup | Documentar integração server-side de 10 linhas; até lá o funil para no clique — e a UI diz isso claramente em vez de mostrar zero signups como se fosse desempenho |
| Adblock corta o snippet | Preferir server-side; o redirecionador é first-party e não é bloqueado |
| Perda de `ref` entre clique e signup | Cookie first-party 90d + `localStorage` + fallback por `vid` |
| Endpoint público abusado | Chave por produto, rate limit por chave, `dedupeKey` unique, payload com teto de tamanho |
| Privacidade | Sem rastreamento cross-site, sem dado pessoal no `growth_events` além do id externo que o próprio produto envia. Documentar o que é coletado |

---

## Critérios de aceite

1. Publicar um post gera automaticamente um link `/r/[code]` com UTMs corretos e `ref` único.
2. Clicar no link redireciona em < 300 ms percebidos e grava exatamente um evento `click`.
3. Enviar um `signup` com o `ref` atribui o signup ao post correto.
4. Enviar o mesmo `signup` cinco vezes cria **um** evento.
5. Um signup sem `ref` mas com `vid` conhecido é atribuído por last-touch dentro de 30 dias.
6. Um signup sem nenhum identificador aparece como "não atribuído" na UI — visível, não descartado.
7. A tela de analytics mostra, por post: cliques, signups e taxa de conversão.
8. Cliques de bot conhecidos não entram na taxa de conversão.
9. Chave de ingestão revogada passa a rejeitar eventos imediatamente.

---

## Testes

- `resolve.ts`: matriz completa (ref / vid / nenhum × dentro-fora da janela × produto certo-errado).
- Redirecionador: code válido, inválido, expirado, com e sem cookie.
- Ingestão: dedupe, chave inválida, chave revogada, produto cruzado, payload malformado.
- Ponta a ponta (Playwright): publicar → clicar → signup → aparece atribuído no analytics.
- Regressão: evento não pode ser atribuído a um post de outro produto, em nenhum caminho.

---

## Porta de saída

Pelo menos um produto real com signups atribuídos chegando por uma semana. Números pequenos
servem — o que não serve é um funil que você não confia. Se os cliques não batem com a analítica do
site promovido dentro de uma margem explicável, resolva isso antes da fase 4: aprendizado sobre
dados errados é pior do que não aprender.
