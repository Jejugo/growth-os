# Fase 5 — Growth Missions

> **Marco:** eu digo *"conseguir os primeiros 100 usuários"* e o sistema decide sozinho o que fazer
> na semana para chegar lá.

> ⚠️ Plano em esboço. Reescreva este documento com o que você aprendeu no mês de uso pós-MVP,
> antes de implementar.

---

## Estado atual (esperado ao entrar na fase)

O sistema gera, publica, mede e aprende — mas a entrada humana ainda é operacional ("planeje a
semana"). O objetivo continua na cabeça do fundador, não no banco.

---

## Objetivo

Inverter a direção do raciocínio: de *instrução de postagem* para *objetivo de negócio* (seção 4).
A missão passa a ser a raiz de tudo — campanhas, alocação de canal e cadência derivam dela e são
replanejadas conforme o progresso.

---

## Escopo

### Dentro

- `GrowthMission` operante (a tabela existe desde a fase 0)
- progresso da missão calculado a partir de `growth_events` — nunca digitado à mão
- planejamento semanal automático: alocação por canal e por tema, com orçamento de exploração
- realocação baseada em desempenho (seção 20 — portfólio, não aposta única)
- tela Autopilot (seção 26) como visão principal do produto

### Fora

Descoberta de oportunidades, grafo de audiência, ação autônoma fora dos canais já suportados.

---

## Banco (esboço)

```ts
missions {                          // tabela criada na fase 0, agora usada
  id, productId, name,
  objectiveType enum('users','signups','paid_customers','reach','followers','revenue'),
  targetValue numeric, currentValue numeric,      // currentValue é derivado, cacheado
  primaryConversion enum(...), secondaryConversion enum(...)?,
  targetDate?, status enum('draft','active','paused','achieved','missed'),
  strategyNotes text,
  createdAt, updatedAt
}

mission_plans {
  id, productId, missionId, weekOf,
  status enum('proposed','active','completed'),
  reasoning text,                   // por que este plano, dado o progresso e os aprendizados
  targetPosts int, targetChannels jsonb,
  explorationBudget numeric(3,2),   // fração dedicada a exploração
  projectedProgress jsonb,          // onde a missão deve estar ao fim da semana
  actualProgress jsonb,             // preenchido no fechamento
  aiCallId, createdAt
}

allocations {
  id, missionPlanId, dimension enum('channel','theme','segment','angle'),
  dimensionValue text,
  share numeric(4,3),               // soma 1.0 por dimensão
  basis enum('performance','exploration','manual'),
  rationale text
}
```

---

## Backend (esboço)

**Alocação — determinística, em código.** O LLM não distribui percentuais; ele explica a
distribuição e escolhe temas dentro dela.

```text
share(canal) = (1 - ε) × share_desempenho + ε × share_uniforme

share_desempenho ∝ conversões por post do canal, nas janelas 28d e all-time
ε = 0,25  (orçamento de exploração; sobe para 0,4 quando a amostra é pequena)
piso = 0,05 por canal ativo   ← nenhum canal morre por completo
teto = 0,50 por canal          ← nenhum canal domina tudo
```

Epsilon-greedy resolve o problema real desta fase e cabe em vinte linhas testáveis. Thompson
sampling é a evolução natural se o volume justificar — não antes; com 4 canais e dezenas de
conversões por semana a diferença é ruído.

**Growth Strategist** (`modules/missions/ai/plan-week.ts`, tier `strong`) recebe: progresso da
missão vs. tempo restante, aprendizados ativos, alocação calculada, capacidade dos canais. Devolve:
temas da semana, ênfase por segmento, e o `reasoning` do plano. Quantidades e percentuais vêm do
código; escolhas qualitativas vêm do modelo.

**Detecção de missão fora do ritmo:** se o progresso projetado ficar abaixo do necessário, o plano
muda de postura (mais exploração, temas diferentes, sugestão de canal novo) e isso aparece no
Autopilot com destaque. Missão em risco silenciosa é pior do que missão sem acompanhamento.

**Growth tick** (fase 2) passa a consultar o `mission_plan` ativo em vez de heurística fixa.
`NO_ACTION` continua sendo resultado legítimo — inclusive "a missão já foi atingida".

---

## UI

Tela **Autopilot** por produto, no formato da seção 26: missão e progresso, estado do autopilot,
números da semana, aprendizados, próxima estratégia. É a tela que o fundador abre de manhã, e ela
deve caber numa tela sem rolagem.

---

## Riscos

| Risco | Mitigação |
|---|---|
| Sistema persegue a métrica errada com eficiência | `primaryConversion` obrigatória; missão de "seguidores" avisa que não é conversão |
| Realocação nervosa semana a semana | Suavização (média móvel de 2 semanas) + mudança máxima de 15 pontos por semana por canal |
| Missão impossível gera atividade frenética | Teto absoluto de posts/dia por canal, acima da alocação; o sistema pode falhar a missão, não pode virar spam |
| Plano autônomo incompreensível | `reasoning` e `allocations.rationale` obrigatórios e visíveis |

---

## Critérios de aceite

1. Criar uma missão e ativar o autopilot faz o sistema produzir um plano semanal sem intervenção.
2. O progresso da missão vem de `growth_events` e bate com o analytics.
3. A alocação respeita piso, teto e o orçamento de exploração.
4. Um canal que teve semana ruim perde participação, mas não desaparece.
5. Missão atingida pausa o autopilot e avisa, em vez de continuar produzindo.
6. Todo plano semanal é explicável: por que estes canais, estes temas, este volume.
