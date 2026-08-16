# Fase 4 — Aprendizado

> **Marco:** o conteúdo da próxima semana é diferente por causa do desempenho da semana passada.
> **Conclui o MVP** (seção 28 do `init.md`).

---

## Estado atual (esperado ao entrar na fase)

O loop `conteúdo → publicação → clique → signup` está fechado e os dados são confiáveis. O gerador
de conteúdo ainda ignora completamente os resultados.

---

## Objetivo

Transformar histórico em mudança de comportamento. A regra da seção 18: **nada de machine learning**.
Estatística agregada, scoring, médias ponderadas, exploração vs. exploração, e o LLM apenas
interpretando métricas já estruturadas.

A distinção que sustenta a fase inteira: **o cálculo é determinístico; o LLM só narra e sugere**.
Se um número aparece numa recomendação, ele veio de SQL — nunca da cabeça do modelo.

---

## Escopo

### Dentro

- rollups de desempenho por dimensão (canal, ângulo, tema, segmento, hook, horário, formato)
- significância mínima antes de qualquer recomendação
- aprendizados gerados por IA, cada um ligado a evidências
- realimentação dos aprendizados no prompt de geração (o loop que fecha o MVP)
- motor de experimentos A/B (as tabelas nasceram na fase 1)
- página de insights

### Fora

Realocação automática de canal (fase 5), bandits contextuais, modelos preditivos, qualquer ML.

---

## Mudanças de banco

```ts
performance_rollups {
  id, productId,
  dimension enum('channel','angle','theme','segment','hook_pattern','posting_hour','format','campaign'),
  dimensionValue text,
  windowStart, windowEnd,             // janelas: 7d, 28d, all-time
  windowKind enum('7d','28d','all'),
  posts int, impressions int, clicks int,
  signups int, activations int, paid int,
  revenue numeric(12,2),
  clickRate numeric(6,4), signupRate numeric(6,4), paidRate numeric(6,4),
  sampleSufficient boolean,           // calculado, não opinado
  computedAt
  unique(productId, dimension, dimensionValue, windowKind, windowEnd)
}

learnings {
  id, productId,
  statement text,                     // "Conteúdo de elegibilidade converte 4,3x mais que carreira genérica"
  kind enum('hypothesis','learning'), // < limiar de amostra ⇒ sempre 'hypothesis'
  direction enum('increase','decrease','keep','test'),
  dimension, dimensionValue,
  evidence jsonb,                     // ids de rollup + números exatos usados
  confidence numeric(3,2),            // determinístico: função de amostra e efeito
  status enum('active','superseded','dismissed'),
  appliedToPrompt boolean,
  aiCallId, createdAt, supersededBy?
}

experiments {
  id, productId, campaignId?,
  name, hypothesis text,
  dimension enum('hook','cta','audience','channel','topic','format','angle','posting_time'),
  primaryMetric enum('paid','activation','signup','qualified_visit','engagement'),
  minSamplePerVariant int,
  status enum('draft','running','concluded','abandoned'),
  winnerVariantId?, conclusion text?,
  startedAt?, endedAt?
}

experiment_variants {
  id, experimentId, label,            // 'A' | 'B'
  spec jsonb,                         // o que muda nesta variante
  posts int, clicks int, signups int, paid int
}

experiment_exposures {
  id, experimentId, variantId, postId, publicationId, assignedAt
}
```

---

## Mudanças de backend

### 1. Rollups — `modules/analytics/rollup.ts` (SQL puro)

Job noturno recalcula as janelas 7d / 28d / all para cada dimensão. Recálculo completo, não
incremental: o volume é pequeno por anos, e recálculo idempotente é imune a evento atrasado.

**Suficiência de amostra** — sem isso o sistema aprende ruído com confiança:

```text
sampleSufficient = posts >= 5 AND clicks >= 100 AND (signups >= 10 OR windowKind = 'all')
```

Limiares em config. Abaixo deles, a dimensão aparece na UI marcada como "dados insuficientes" e
**não** pode virar `learning` — no máximo `hypothesis`.

### 2. Confiança determinística

```text
confidence = f(tamanho da amostra, tamanho do efeito, consistência entre janelas)
```

Calculada em código. Uma diferença de 3x com 12 signups não é a mesma coisa que 3x com 400, e o
sistema precisa saber disso sem perguntar ao modelo. O LLM **recebe** a confiança; não a produz.

### 3. Analista de desempenho — `modules/analytics/ai/summarize-performance.ts`

Tier `strong`. Entrada: rollups com significância marcada + aprendizados ativos + hipóteses das
campanhas. Saída estruturada: lista de `learnings` com `statement`, `direction`, `dimension`,
`evidence` (obrigatoriamente ids de rollup existentes).

Validações duras: todo `evidence` deve referenciar rollups reais; todo número no `statement` deve
bater com o rollup citado; dimensão com `sampleSufficient=false` só produz `hypothesis`.
Aprendizado que não passa em uma dessas checagens é descartado, não corrigido.

### 4. Realimentação — o que fecha o MVP

Os aprendizados ativos entram em dois pontos:

- **Geração de ideias**: a distribuição-alvo de ângulos passa a ser ponderada pelo desempenho.
  Cálculo em código, com **teto e piso**: nenhum ângulo passa de 40% nem cai a 0%. Nada é eliminado
  por completo — o mercado muda e um ângulo morto precisa poder ressuscitar.
- **Escrita**: os aprendizados viram um bloco explícito de contexto no prompt (`o que funciona /
  o que não funciona neste produto`), com números.

**Orçamento de exploração:** 25% das ideias de cada semana ignoram deliberadamente os aprendizados.
Sem isso o sistema converge para um máximo local em três semanas e nunca mais descobre nada.

### 5. Motor de experimentos

Alocação determinística: ao criar posts para uma ideia sob experimento, as variantes são
distribuídas alternadamente por canal e horário para não confundir a variável com o contexto.
Conclusão: quando ambas as variantes atingem `minSamplePerVariant`, o sistema calcula a diferença e
propõe um vencedor — a confirmação é humana nesta fase.

Um experimento nunca é decidido por curtidas. `primaryMetric` só aceita métricas da lista de
prioridade da seção 19, e o default é `signup`.

---

## Workflows

- `trigger/compute-rollups.ts` — diário, 04:00 no fuso do produto. Idempotente por definição.
- `trigger/generate-learnings.ts` — semanal, depois dos rollups. Marca aprendizados antigos
  contraditos como `superseded` em vez de apagá-los; a história de como a estratégia mudou é dado.
- `trigger/evaluate-experiments.ts` — diário; conclui experimentos que atingiram a amostra.

---

## Mudanças de UI

- `/products/[id]/insights` — aprendizados ativos com direção, confiança e evidência clicável;
  hipóteses separadas dos aprendizados; aprendizados superados em histórico.
- `/products/[id]/experiments` — experimentos ativos, variantes, progresso da amostra, resultado.
- Dashboard finalmente ganha a forma da seção 26: progresso, publicações recentes, experimentos,
  aprendizados, aprovações pendentes.
- No painel de revisão de conteúdo, mostrar **por que** aquele ângulo foi escolhido (o aprendizado
  que o motivou). Sem isso, o comportamento autônomo vira caixa-preta bem na hora em que começa a
  tomar decisões de verdade.

---

## Riscos

| Risco | Mitigação |
|---|---|
| Aprender ruído com amostra minúscula | Limiares de suficiência; `hypothesis` ≠ `learning`; confiança determinística |
| Convergência prematura num único ângulo | Teto de 40%, piso > 0, 25% de exploração obrigatória |
| LLM inventa números na narrativa | Toda evidência checada contra rollups; violação descarta o aprendizado |
| Confundir correlação com causa (ex.: um post viralizou por motivo externo) | Detectar outliers e sinalizá-los; o experimento é o único caminho para causalidade e a UI diz isso |
| Aprendizados contraditórios acumulados | `superseded` explícito, com no máximo N aprendizados ativos por dimensão |
| Loop de feedback com atribuição errada | Depende da porta de saída da fase 3 ter sido levada a sério |

---

## Critérios de aceite

1. Os rollups reproduzem exatamente os números do analytics da fase 3 (reconciliação por SQL).
2. Uma dimensão com 2 posts e 20 cliques é marcada como insuficiente e não gera aprendizado.
3. Aprendizados gerados citam evidências que existem e números que batem com os rollups.
4. A distribuição de ângulos da semana seguinte muda de forma mensurável após um aprendizado forte —
   e o teto/piso são respeitados.
5. 25% das ideias de cada semana são explicitamente marcadas como exploração.
6. Um experimento A/B roda, atinge a amostra e propõe um vencedor pela métrica primária.
7. Nenhum experimento pode ter engajamento como métrica primária sem override manual explícito.
8. É possível responder, para qualquer post gerado: qual aprendizado influenciou sua criação.
9. **Os 14 itens da seção 28 do `init.md` passam de ponta a ponta em um produto real.**

---

## Testes

- Rollups: dados semeados com números conhecidos → agregados conferidos.
- Suficiência: casos exatamente na borda dos limiares.
- Ponderação de ângulos: aprendizado forte → nova distribuição respeita teto, piso e exploração.
- Validação de aprendizado: evidência inventada é rejeitada.
- Experimentos: alocação equilibrada, conclusão só com amostra, empate tratado.

---

## Fim do MVP

Ao passar nos critérios, o MVP da seção 28 está completo. **Pare e use o sistema por pelo menos um
mês antes da fase 5.**

Este é o ponto de maior risco de escopo do projeto: a fase 5 em diante é a parte empolgante, e é
exatamente por isso que ela merece esperar. Um mês de uso real responde perguntas que nenhum
planejamento responde — quanto conteúdo você realmente aprova, quais aprendizados eram óbvios e
quais surpreenderam, onde a autonomia te deixa desconfortável. A fase 5 fica muito melhor depois
dessas respostas, e talvez fique diferente do que está escrito aqui.
