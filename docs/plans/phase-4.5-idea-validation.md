# Fase 4.5 — Validação de Ideia

> **Marco:** eu insiro uma ideia que ainda não existe como produto, o sistema roda um teste de
> demanda real e me devolve um veredito com evidência — **construir, pivotar ou matar**.

> ⚠️ Fase inserida depois do MVP. Só comece depois de pelo menos uma semana de uso real das
> fases 0–4 e com **mais de um canal publicando de fato** (ver "Pré-condições").

---

## Estado atual (esperado ao entrar na fase)

O sistema gera, publica, mede e aprende. Mas ele só sabe falar de produtos que **já existem**:
`products.url` e `products.domain` são `notNull` (`src/modules/products/schema.ts:41-42`) e o
`ProductProfile` nasce de crawling (`product_crawl_snapshots`). Uma ideia não tem o que crawlear.

Tudo o mais de que a validação precisa já está construído:

| Peça existente | Onde | Papel na validação |
|---|---|---|
| `experiments` + `experiment_variants` | `src/modules/content/schema.ts:197` | Testar ângulos de posicionamento entre si |
| `growth_events` (`signup`, `activation`, `paid`) | `src/modules/attribution/schema.ts:66` | Contar e atribuir os sinais de demanda |
| Tracking links + UTM + `/r/[code]` | fase 3 | Saber **qual ângulo e canal** trouxe cada inscrito |
| Motor de conteúdo e distribuição | fases 1–2 | Gerar o tráfego que alimenta o teste |

Esta fase adiciona **um estágio de produto, um brief e um gate de decisão**. Não reescreve nada.

---

## Objetivo

Estender o domínio de "produto no ar" para "ideia em teste", sem duplicar o motor. Uma ideia entra
por um brief escrito, ganha um perfil, recebe conteúdo e distribuição como qualquer produto, e é
julgada por um **gate determinístico** ao fim de uma janela fechada.

Duas regras herdadas da fase 4 valem aqui inteiras:

> **O cálculo é determinístico; o LLM só narra e sugere.** O veredito vem de SQL e de um limiar
> escrito em código. O modelo redige a justificativa e propõe o pivô — nunca decide.

> **Nada de ML.** Contagem, taxa e limiar mínimo de amostra.

### A correção que sustenta o desenho

**Waitlist mede interesse, não demanda.** Um e-mail é barato de dar e infla otimismo. Por isso o
gate desta fase **não pode ser satisfeito só por inscrições**: exige pelo menos um sinal forte —
alguém que aceitou conversar ou que pagou/depositou. Um teste com 400 e-mails e zero conversas é
um teste **reprovado**, não aprovado.

---

## Pré-condições (porta de entrada)

Esta fase valida ideias usando o motor de distribuição existente. Se o motor for fraco, o veredito
mede o motor, não a ideia.

1. Fases 0–4 rodando em uso real por ≥ 1 semana.
2. **Pelo menos dois canais publicando de verdade.** Hoje só o Bluesky publica: LinkedIn está em
   `manual_assist` e Reddit em rascunho (`src/modules/distribution/channels/`). Validar uma ideia
   B2B só pelo Bluesky produz um "não" que não significa nada.

Sem isso, o resultado esperado de qualquer teste é `INCONCLUSIVO` — o que é correto, mas inútil.

---

## Escopo

### Dentro

- estágio de ciclo de vida no produto (`idea → validating → building → launched`)
- brief de ideia como fonte alternativa de perfil (sem crawl, sem URL obrigatória)
- `validations`: janela fechada, hipótese, limiares e veredito
- gate determinístico com distinção explícita entre **ideia reprovada** e **teste inconclusivo**
- reinterpretação documentada dos `growth_events` durante a validação
- tela de validação com o placar ao vivo e o veredito
- timeline visual do produto pelos 4 estágios (`idea → validating → building → launched`)

### Fora

- pesquisa/descoberta automática de demanda → **fase 6**
- criação de landing page pelo sistema (o humano sobe a landing; o sistema traz tráfego)
- entrevistas automatizadas, envio de e-mail para a waitlist → **fase 7**
- realocação automática de canal → **fase 5**

---

## Mudanças de banco

### 1. Produto: URL opcional e estágio

```ts
products {
  url    text            // notNull → NULLABLE
  domain text            // notNull → NULLABLE (o unique continua; em Postgres NULL != NULL,
                         // então várias ideias sem domínio convivem sem conflito)
  stage  enum('idea','validating','building','launched')  NOT NULL DEFAULT 'launched'
}
```

**Migration preserva dados:** todo produto existente nasceu de crawl, logo já está no ar — o
default `'launched'` é correto para todos eles e nenhuma linha precisa ser tocada.

`stage` é ortogonal a `status` (`active|paused|archived`), que continua sendo operacional. Um
produto pode estar `validating` **e** `paused`.

**Regra de integridade:** `url`/`domain` só podem ser nulos quando `stage = 'idea'`. A partir de
`validating` existe uma landing page — quem roda waitlist precisa de uma página. Vale como
`CHECK` no banco, não só como validação de aplicação.

### 2. Brief da ideia

```ts
product_briefs {
  id, productId,
  problem       text NOT NULL,     // que dor, de quem
  audience      text NOT NULL,
  solutionSketch text NOT NULL,
  whyNow        text,
  alternatives  text,              // como resolvem hoje (inclui "planilha" e "nada")
  riskiestAssumption text NOT NULL, // o que precisa ser verdade para a ideia existir
  createdAt, updatedAt
}
```

`riskiestAssumption` é obrigatório de propósito: é ele que vira a hipótese do teste. Sem ele a
validação vira coleta de e-mail sem pergunta.

O brief alimenta o **passo 2** da análise de produto já existente (`productPositioningSchema` em
`src/modules/products/types.ts`), pulando o passo 1 (extração factual do crawl). O perfil resultante
grava `profileSource = 'human'` — valor que **já existe** no enum `profile_source`.

### 3. A validação

```ts
validations {
  id, productId,
  hypothesis     text NOT NULL,       // deriva de riskiestAssumption
  landingUrl     text NOT NULL,
  status         enum('draft','running','concluded','aborted') DEFAULT 'draft',
  startedAt, endsAt,                  // janela FECHADA, definida antes de começar

  // limiares — gravados na criação, nunca editáveis depois (ver Riscos)
  minVisitors      int     NOT NULL DEFAULT 300,
  minSignups       int     NOT NULL DEFAULT 100,
  minSignupRate    numeric(5,4) NOT NULL DEFAULT 0.0400,
  minStrongSignals int     NOT NULL DEFAULT 5,

  verdict        enum('build','pivot','kill','inconclusive'),
  verdictReason  text,                // redigido pelo LLM a partir dos números
  verdictAt, aiCallId,
  createdAt, updatedAt
}
```

Os defaults são ponto de partida, não verdade revelada — ajuste-os depois do primeiro teste real.

**Limiares congelados na criação** é o ponto mais importante da tabela inteira. Um limiar editável
depois de ver o resultado não é limiar, é racionalização.

### 4. Sinais: reusar `growth_events`, não criar tabela

Durante `stage = 'validating'`, os tipos de evento existentes ganham leitura específica:

| Evento | Significado na validação | Peso |
|---|---|---|
| `signup` | inscrição na waitlist | fraco |
| `activation` | aceitou conversa / respondeu pesquisa | **forte** |
| `paid` | pré-venda, depósito, carta de intenção | **forte** |

Nenhum enum novo, nenhuma tabela nova, toda a atribuição da fase 3 vale de graça. O mapeamento
mora numa constante única em `modules/validation/signals.ts` e aparece na UI — leitura implícita
de evento é como analytics silenciosamente mente.

### 5. Histórico de estágio

```ts
product_stage_events {
  id, productId,
  fromStage enum('idea','validating','building','launched')?,   // null na primeira linha
  toStage   enum('idea','validating','building','launched') NOT NULL,
  actor     enum('human','system'),
  reason    text,                // livre; para 'validating'→'building'/'kill' aponta o validationId
  validationId?,                 // preenchido quando a transição veio de um veredito
  occurredAt NOT NULL DEFAULT now()
}
```

Existe só para alimentar a timeline visual (seção UI) com data real de cada mudança de estágio —
sem isso a tela não tem o que desenhar além do estágio atual. Toda mudança de `products.stage`
passa por uma função `changeStage(product, toStage, actor, reason)` que grava a linha antes de
fazer o `UPDATE`; um `UPDATE` direto de `stage` fora dela é bug, mesma regra que já vale para a
máquina de estados de publicação (seção 6.3 do roadmap).

`idea → validating` e `validating → building|kill` são `actor = 'system'`, disparadas pelo gate
(seção Backend) ou pela criação da validação. `building → launched` é sempre `actor = 'human'`:
esta fase não tem visibilidade sobre o desenvolvimento do produto em si (código, features, deploy)
— só quem constrói sabe quando o produto está pronto para ser chamado de lançado. Nenhuma
automação nova é necessária: um botão "Marcar como lançado" na timeline grava o evento e atualiza
`products.stage`.

---

## Backend

### Composição do gate (determinístico, em código)

```text
visitantes  = distinct visitorId em growth_events (produto, janela)
inscritos   = count(signup)
fortes      = count(activation) + count(paid)
taxa        = inscritos / visitantes

1. visitantes < minVisitors            → INCONCLUSIVE   ("o teste falhou, não a ideia")
2. inscritos >= minSignups
   E taxa    >= minSignupRate
   E fortes  >= minStrongSignals       → BUILD
3. taxa >= minSignupRate E fortes == 0 → PIVOT           (interesse sem intenção)
4. taxa < minSignupRate E fortes > 0   → PIVOT           (nicho existe, mensagem erra)
5. caso contrário                      → KILL
```

A regra 1 vem antes de todas as outras e é inegociável: **tráfego insuficiente nunca produz um
"não"**. É o que impede o sistema de matar uma ideia boa por causa de um motor de distribuição
fraco — exatamente o risco descrito nas Pré-condições.

As regras 3 e 4 separam os dois pivôs que importam: gente que quer mas não age, e gente que age mas
não foi bem abordada. O primeiro é problema de produto; o segundo, de mensagem.

### Ângulos como experimento

A validação cria **um `experiment`** (tabela existente) com `dimension = 'angle'` e 2–3 variantes de
posicionamento derivadas do brief. O motor da fase 4 já calcula qual ângulo converte melhor e já
respeita `minSamplePerVariant`. Resultado: quando o veredito é `pivot`, o sistema não diz só
"pivote" — mostra qual ângulo estava ganhando.

Nenhum código novo de experimento. Só instanciação.

### O que o LLM faz (e o que não faz)

**Faz:** transformar brief em perfil e em ângulos candidatos; redigir `verdictReason` a partir dos
números já apurados; propor 2–3 pivôs concretos quando o veredito é `pivot`.

**Não faz:** escolher o veredito, calcular ou estimar qualquer número, ajustar limiar.

Prompts em `modules/validation/ai/`, tier `strong` (raciocínio de posicionamento — a mesma escolha
do passo 2 da fase 0).

---

## Workflows

- **`conclude-validation`** (Trigger.dev, diário): fecha validações cujo `endsAt` passou, roda o
  gate, chama o LLM para a justificativa, grava o veredito. Idempotente por `validationId`.
- **Growth tick** (fase 2): produto em `validating` gera conteúdo a partir dos ângulos do
  experimento, apontando para `landingUrl`. Produto em `idea` **não** gera conteúdo — sem landing,
  não há para onde mandar tráfego.
- **`build`** promove o produto para `stage = 'building'` e **pausa** a geração de conteúdo. Anunciar
  semanas de silêncio é pior do que não anunciar.

---

## UI

Uma tela por validação, em `app/products/[id]/validation`:

- hipótese, janela e **os limiares definidos na criação** (visíveis desde o dia 1 — o placar não
  faz sentido sem a régua)
- placar ao vivo: visitantes, inscritos, taxa, sinais fortes, cada um contra seu limiar
- ângulos do experimento e desempenho comparado
- **projeção de amostra**: no ritmo atual, o teste chega ao `minVisitors` antes do `endsAt`? Se não,
  avise **cedo** — dá tempo de aumentar distribuição em vez de descobrir um `INCONCLUSIVE` no fim
- veredito com a justificativa e, quando `pivot`, os pivôs propostos

Formulário de ideia: brief primeiro, URL depois. Criar produto sem URL não pode ser um caminho
escondido atrás de um campo opcional.

### Timeline do produto

Uma trilha em `app/products/[id]` (topo da página do produto, não uma rota separada — é o primeiro
coisa que se quer ver ao abrir um produto), com os 4 estágios em sequência: `idea → validating →
building → launched`. Para cada estágio já percorrido: data da transição (`product_stage_events`)
e, quando aplicável, o motivo (link para o `validationId` e o veredito).

- estágio atual em destaque; estágios futuros em cinza, sem data
- `idea → validating`: mostra a data de início do teste
- `validating → building`: mostra o veredito (`build`) e um link para a tela de validação concluída
- `validating → kill`: **não avança a trilha** — o produto encerra ali, exibido como "descontinuado
  na validação", com o veredito e a razão visíveis. Não é o mesmo desenho de estar "em building"
  parado; é um estado terminal.
- `building → launched`: manual, botão explícito ("Marcar como lançado"); sem métrica automática
  porque esta fase não enxerga o desenvolvimento do produto, só o crescimento em torno dele

A trilha é deliberadamente rasa — 4 estágios, sem sub-etapas de engenharia (sprints, features,
tarefas). Rastrear *como* o produto está sendo construído é fora do domínio do GrowthOS; a timeline
mostra só os marcos que o motor de crescimento entende e reage a eles (gera conteúdo em
`validating`, pausa em `building`, retoma em `launched`).

---

## Integrações

Nenhuma nova. A waitlist da landing envia `signup` para `POST /api/events` (fase 3), com a mesma
chave de ingestão e o mesmo dedupe. Conversas e pré-vendas entram como `activation`/`paid` — por
enquanto registradas à mão na UI, porque o volume é de dezenas e um formulário resolve.

---

## Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| Limiar ajustado depois de ver o resultado | A validação vira teatro; o sistema sempre concorda com o fundador | Limiares imutáveis após `status = 'running'`; mudar exige abortar e recomeçar, com o abortado visível no histórico |
| Distribuição fraca mata ideia boa | Decisão errada e irreversível | Regra 1 do gate (`INCONCLUSIVE` antes de tudo) + pré-condição de 2 canais + alerta de projeção de amostra |
| Waitlist infla confiança | Constrói-se o errado com convicção | `minStrongSignals` > 0 é obrigatório para `BUILD`; e-mail sozinho nunca aprova |
| Eventos de validação contaminam rollups da fase 4 | Aprendizados calculados sobre semântica trocada | Rollups e aprendizados filtram por `stage`; produto em validação não alimenta o aprendizado global |
| Ideias-zumbi acumuladas | Banco vira cemitério e a UI perde o foco | `endsAt` obrigatório; validação vencida sem conclusão aparece como pendência, não some |
| Produto sem URL vaza para o resto do sistema | Crawler, tracking link e adapters quebram com `null` | `CHECK` no banco + `stage = 'idea'` não entra no growth tick |

---

## Critérios de aceite

1. Criar um produto a partir de um brief, **sem URL**, produz um perfil editável com
   `profileSource = 'human'`.
2. Iniciar uma validação exige janela e limiares, e os limiares ficam imutáveis depois.
3. Produto em `validating` gera e publica conteúdo apontando para a `landingUrl`, com os ângulos
   como variantes de um experimento.
4. Um `signup` vindo da landing aparece atribuído ao post e ao canal que o originou.
5. Com tráfego abaixo de `minVisitors`, o veredito é `inconclusive` — **nunca** `kill`.
6. Inscrições acima do limiar mas zero sinais fortes produzem `pivot`, não `build`.
7. Todo veredito é explicável: números apurados, limiares aplicados e regra que decidiu.
8. Veredito `build` promove para `building` e para a geração de conteúdo.
9. Produtos em validação não contaminam os aprendizados da fase 4.
10. Migration roda sobre banco com dados e todo produto existente termina em `stage = 'launched'`.
11. Toda transição de `products.stage` grava uma linha em `product_stage_events`; a timeline do
    produto reflete essas linhas em ordem, sem gaps.
12. Um veredito `kill` aparece na timeline como estado terminal, distinto de `building`.

---

## Testes

- gate: uma tabela de casos cobrindo as cinco regras, incluindo as fronteiras exatas de cada limiar
- imutabilidade de limiar após `running`
- `CHECK` de URL nula fora de `stage = 'idea'`
- isolamento: evento de produto em validação não entra em `performance_rollups`
- idempotência de `conclude-validation` em execução repetida
- `changeStage` é o único caminho que altera `products.stage`: um `UPDATE` direto não passa no lint
- toda transição de estágio (as 4 combinações válidas) produz exatamente uma linha em
  `product_stage_events`, com `fromStage`/`toStage`/`actor` corretos
