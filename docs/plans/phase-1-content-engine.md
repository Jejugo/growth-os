# Fase 1 — Motor de conteúdo

> **Marco:** o sistema cria uma semana coerente de conteúdo de marketing para um produto, sem
> repetir a si mesmo, e eu aprovo ou rejeito cada peça.

---

## Estado atual (esperado ao entrar na fase)

Produtos e Product Profiles existem, versionados e editáveis. `AIProvider`, `job_runs`, `decisions`
e contabilidade de custo funcionam. Nenhuma noção de audiência, campanha ou conteúdo.

---

## Objetivo

Implementar a hierarquia da seção 9 do `init.md`:

```text
Mission → Campaign → Content Theme → Content Idea → Platform-specific Post
```

E o requisito que separa isto de um gerador de posts qualquer: **memória**. Antes de gerar, o
sistema recupera o que já foi produzido e evita repetir ideia, hook, argumento e CTA (seção 23).

Nesta fase não se publica nada. A saída é conteúdo em tela, aprovável.

---

## Escopo

### Dentro

- segmentos de audiência (gerados por IA a partir do perfil, editáveis)
- campanhas e temas de conteúdo
- ideias de conteúdo com rotação obrigatória de ângulo
- `ContentAsset` (peça-mãe) → `SocialPost` (variante por plataforma) — atomização
- memória de conteúdo + deduplicação determinística
- Risk Reviewer (gate de qualidade e política, antes de qualquer aprovação)
- workflow de aprovação com motivo de rejeição
- UI de conteúdo em kanban

### Fora

Publicação, agendamento real, contas de canal, UTMs, métricas, missões com lógica, experimentos
rodando (as tabelas nascem aqui, o motor é da fase 4).

---

## Mudanças de banco

```ts
audience_segments {
  id, productId,
  name, description,
  locations text[], professions text[], seniority text[],
  interests text[], painPoints text[], keywords text[],
  audienceFitScore int,            // 0..100 — nesta fase é estimativa da IA
  problemIntensityScore int,
  conversionPotentialScore int,
  scoreSource enum('ai_estimate','measured') default 'ai_estimate',
  status enum('active','paused','archived'),
  createdAt, updatedAt
}

campaigns {
  id, productId, missionId?,
  name, bigIdea text, hypothesis text,
  audienceSegmentIds uuid[],
  status enum('draft','active','paused','completed'),
  startsAt?, endsAt?,
  createdAt, updatedAt
}

content_themes {
  id, productId, campaignId,
  name, description, keywords text[],
  status, createdAt, updatedAt
}

content_ideas {
  id, productId, campaignId, themeId, audienceSegmentId?,
  title, summary,
  angle enum(...14 valores da seção 10...),
  supportingFacts jsonb,     // fatos vindos do perfil ou de dados próprios
  status enum('proposed','approved','rejected','used'),
  rejectionReason?,
  createdAt, updatedAt
}

content_assets {              // a peça-mãe: artigo, pesquisa, dataset, análise
  id, productId, ideaId,
  type enum('article','research','dataset','chart','carousel','newsletter','none'),
  title, body text,
  status, createdAt, updatedAt
}

social_posts {
  id, productId, ideaId, assetId?, campaignId,
  channel enum('bluesky','linkedin','reddit','blog','newsletter'),
  variantOf uuid?,            // variantes de experimento
  hook text,                  // primeira linha — dimensão de dedupe e de experimento
  body text,
  cta text?,
  ctaType enum('none','soft','direct'),
  linkUrl text?,              // preenchido com tracking link na fase 3
  mediaPlan jsonb?,
  status enum('draft','pending_approval','approved','rejected','scheduled','published','cancelled'),
  rejectionReason?,
  riskReview jsonb,           // veredito + motivos do Risk Reviewer
  createdAt, updatedAt
}

content_fingerprints {
  id, productId, postId?, ideaId?,
  kind enum('idea','hook','argument','cta'),
  normalizedText text,
  hash text,                  // sha256 do texto normalizado
  createdAt
  index gin(normalizedText gin_trgm_ops)
}

content_feedback {
  id, productId, postId?, ideaId?,
  action enum('approved','rejected','edited'),
  reason text?, editedFrom text?, editedTo text?,
  createdAt
}

// tabelas criadas vazias, motor só na fase 4
experiments, experiment_variants
```

---

## Mudanças de backend

### 1. Audiências — `modules/audiences/ai/derive-segments.ts`

Tier `strong`. Entrada: Product Profile atual. Saída: 3–5 segmentos com os campos e scores acima.
Os scores são **estimativas declaradas como tais** (`scoreSource='ai_estimate'`) — a fase 4 os
substitui por medição. Marcar isso no banco desde agora evita a confusão entre "a IA acha" e "os
dados mostram", que é exatamente o tipo de erro que envenena o motor de aprendizado.

### 2. Planejamento de campanha — `modules/campaigns/ai/plan-campaign.ts`

Tier `strong`. Entrada: perfil + segmentos escolhidos + campanhas anteriores (para não repetir a
big idea). Saída: campanha com hipótese explícita + 3–5 temas.

A hipótese é obrigatória e em formato testável: *"Se falarmos de X para Y, então Z converte porque
W"*. Sem hipótese, a fase 4 não tem o que avaliar.

### 3. Ideias — `modules/campaigns/ai/generate-ideas.ts`

Tier `standard`. Regra determinística **em código, não no prompt** (seção 31, regra 13):

- o gerador recebe uma lista de ângulos já usados nos últimos 30 dias, por tema;
- a distribuição-alvo de ângulos é calculada em código (nenhum ângulo > 30% das ideias da semana);
- o prompt gera ideias **para um ângulo específico por chamada**, não "gere 10 ideias variadas".

Pedir variedade a um LLM produz variedade superficial. Forçar o ângulo por chamada produz variedade
real.

### 4. Escrita — `modules/content/ai/write-post.ts`

Tier `standard`. Uma chamada por (ideia × canal). O prompt recebe:

- o Product Profile e o segmento-alvo;
- as capacidades do canal, vindas do `ChannelCapabilities` do adapter — **nunca inventadas pelo LLM**;
- **memória**: os 20 posts mais recentes do produto (hook + ideia + ângulo + CTA) e os hooks
  rejeitados com motivo;
- exemplos de voz, se existirem.

### 5. Deduplicação — `modules/content/dedupe.ts` (determinístico)

Executa antes do Risk Reviewer. Para cada dimensão (`idea`, `hook`, `argument`, `cta`):

1. normaliza (lowercase, remove pontuação/stopwords/emoji, ordena tokens para o hash de argumento);
2. hash exato → colisão = rejeição imediata;
3. `pg_trgm similarity` contra os fingerprints do produto nos últimos 90 dias;
4. limiar: `> 0.75` em hook ou ideia → rejeitado; `0.6–0.75` → marcado como `near_duplicate`, vai
   para revisão humana com o post parecido lado a lado.

Sem embeddings. Se na prática escapar repetição semântica com palavras diferentes, aí sim considerar
`pgvector` — mas só com casos reais na mão.

### 6. Risk Reviewer — `modules/content/ai/review-risk.ts`

Tier `strong`, roda em todo post antes de ficar aprovável. Verifica:

- claims factuais não sustentados pelo perfil ou por `supportingFacts`;
- promessas de resultado, dado sem fonte, comparação direta com concorrente nomeado;
- tom que soe automatizado ou promocional demais para o canal;
- adequação à política do canal.

Saída: `{ verdict: 'pass' | 'flag' | 'block', reasons[], suggestedFix? }`. `block` nunca pode ser
aprovado pela UI sem uma edição — o botão fica desabilitado. O veredito fica em `riskReview` e é
insumo do aprendizado depois.

### 7. Aprovação

Transições: `draft → pending_approval → approved | rejected`. Rejeição **exige motivo** — é o dado
mais valioso desta fase, porque alimenta memória e prompts.

---

## Workflows em background

`trigger/plan-content-week.ts` — payload `{ productId, campaignId?, weekOf }`,
idempotency `plan-week:${productId}:${isoWeek}`:

```text
1. carrega perfil + segmentos + memória de conteúdo
2. se não há campanha ativa → planeja campanha (strong)
3. calcula distribuição-alvo de ângulos (código)
4. gera ideias por ângulo (standard, N chamadas)
5. dedupe de ideias → descarta e regenera até 2 vezes
6. seleciona ideias × canais conforme mix configurado
7. escreve posts (standard, paralelismo limitado a 4)
8. dedupe de hook/argumento/CTA
9. Risk Reviewer (strong)
10. grava tudo como pending_approval; registra decisions e custo
```

Falha parcial não perde trabalho: cada ideia/post é gravada assim que passa nos gates. Um retry
retoma do que faltou, guiado pelo estado no banco — não reprocessa o que já existe.

---

## Mudanças de UI

- `/products/[id]/audiences` — segmentos, scores, edição, ativar/pausar.
- `/products/[id]/campaigns` — campanhas, hipótese, temas, status.
- `/products/[id]/content` — **kanban**: `Ideias | Rascunho | Revisão | Aprovado | Rejeitado`.
  Card mostra canal, ângulo, hook, veredito de risco e alerta de quase-duplicata.
- Painel de revisão de post: texto editável, post semelhante lado a lado quando houver,
  motivos do Risk Reviewer, aprovar / rejeitar-com-motivo.
- Botão "Planejar semana" que dispara o workflow e mostra progresso.

Sem calendário nesta fase — não há agendamento ainda. Ele entra na fase 2.

---

## Riscos

| Risco | Mitigação |
|---|---|
| Conteúdo tecnicamente ok e chato | Ângulo forçado por chamada + `supportingFacts` obrigatório para ângulos de dado/pesquisa. Se o produto não tem dado próprio, esses ângulos ficam indisponíveis em vez de serem inventados |
| Dedupe agressivo demais bloqueia tudo | Limiares em config, não no código; faixa intermediária vai para humano em vez de bloquear |
| Risk Reviewer vira teatro (sempre "pass") | Auditar 20 posts à mão contra o veredito antes de confiar nele. Se der 100% pass, o prompt está fraco |
| Custo por semana de conteúdo alto demais | Contar: 1 strong (campanha) + N standard (ideias/posts) + N strong (risco). Se o risco pesar, testá-lo em `standard` com amostragem de auditoria |
| Explosão de tabelas de conteúdo | `ContentAsset` só existe quando há peça-mãe real; para um post avulso, `assetId` é nulo. Não criar asset vazio por simetria |

---

## Critérios de aceite

1. A partir de um Product Profile, o sistema gera 3–5 segmentos coerentes e editáveis.
2. "Planejar semana" produz 1 campanha, 3–5 temas, 8–12 ideias e 10–20 posts em ≤ 5 minutos.
3. Nenhum ângulo representa mais de 30% das ideias de uma semana.
4. Gerar duas semanas seguidas **não** produz hooks quase idênticos: rodar o gerador com a mesma
   entrada duas vezes resulta em rejeição por duplicata na segunda.
5. Todo post tem um veredito de risco e nenhum post `block` pode ser aprovado pela UI.
6. Rejeitar um post com motivo faz esse motivo aparecer no contexto da geração seguinte.
7. Custo total de uma semana de conteúdo é reportado por produto e campanha.
8. Uma falha no meio do workflow, ao ser retomada, não duplica ideias nem posts.

---

## Testes

- Dedupe: pares idênticos, quase-idênticos, parafraseados, distintos — com limiares fixados.
- Rotação de ângulo: dado histórico, a distribuição-alvo respeita o teto de 30%.
- Máquina de estados de conteúdo: transições inválidas rejeitadas.
- Validação de saída de IA: capacidade de canal fabricada pelo LLM é descartada em favor do adapter.
- Prompt de memória: os últimos N posts realmente entram no contexto (teste de montagem de prompt).

---

## Porta de saída

Você olha a semana gerada e pensa *"eu publicaria a maior parte disso"*. Se você reescreve tudo, o
problema é de prompt e de perfil — resolva antes de automatizar a publicação. Automatizar a
distribuição de conteúdo ruim só faz o problema chegar mais rápido em mais gente.
