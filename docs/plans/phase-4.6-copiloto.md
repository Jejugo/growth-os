# Fase 4.6 — Copiloto

> **Marco:** eu abro o Painel e recebo 2-3 recomendações concretas com um clique de distância, mais
> um retrato do que o sistema decidiu sozinho recentemente — em vez de precisar caçar isso em sete
> abas diferentes.

> ⚠️ Fase inserida depois da 4.5, antes da 5. Só existe porque não exige nada que as fases 0, 2 e 4
> não tenham construído — nenhum motor novo, nenhuma tabela de missão, nenhum LLM de estratégia.

---

## Estado atual (esperado ao entrar na fase)

Dois pedaços do que o Copiloto precisa **já existem e já são reais**, só não têm tela:

- **Log de decisões** (`decisions`, `src/lib/observability/schema.ts:39-53`) é escrito por sete
  workflows diferentes (`growth-tick`, `plan-content-week`, `generate-learnings`,
  `reconcile-publications`, `analyze-product`, `generate-validation-content`) desde a Fase 0.
  Hoje só é lido por `recentDecisions(productId)`, usado num canto da tela de Perfil — nunca visto
  agregado, nunca visto sem entrar produto por produto.
- **Aprendizados com direção e confiança** (`learnings`, Fase 4) já influenciam a distribuição de
  ângulos da próxima semana **automaticamente**, via `selectAnglesForWeek` em
  `plan-content-week.ts:209` — todo aprendizado ativo é aplicado sem confirmação humana. O campo
  `learnings.appliedToPrompt` existe no schema e tem um setter (`markLearningApplied`,
  `src/modules/analytics/repo.ts:100`) mas **nenhum código chama esse setter** — é uma trava que
  foi desenhada e nunca ligada.

Isso muda a leitura do mockup de referência (`docs/design/GrowthOS.dc.html`, seção "Copiloto"): a
sugestão de exemplo *"trocar posts de solution por problem"* não é uma ação pendente — já
aconteceu, sozinha, na última geração de conteúdo. Não faz sentido pedir "Aplicar" para algo que já
foi aplicado. Essa fase corrige o mockup nesse ponto (ver "Decisão de design" abaixo).

O que **não** existe: qualquer lugar que gere uma recomendação e ofereça uma ação de um clique.
`automation_policies.level` e `maxPostsPerDay` (Fase 2) só mudam pela mão do usuário em
`/products/[id]/channels`, mesmo quando os dados já dizem qual seria a mudança óbvia.

---

## Objetivo

Duas coisas, e só duas — a regra da Fase 4 vale aqui também: **nada de machine learning, nada de
LLM decidindo o quê recomendar**. O cálculo de quando recomendar é determinístico (SQL); no máximo
um LLM de tier `cheap` narra a frase, o número nunca vem da cabeça do modelo.

1. **Transparência**: agregar `decisions` de todos os produtos numa única leitura, sem precisar
   entrar produto por produto.
2. **Sugestão com ação real**: um pequeno conjunto fixo de situações (seção "Regras de sugestão")
   em que a resposta certa já é computável hoje, com uma função de mutação que **já existe** por
   trás do botão "Aplicar" — nunca um botão decorativo.

**Não-objetivo explícito**: recriar as 3 sugestões do mockup literalmente. Duas delas (rebalanceamento
de ângulo, "aumentar distribuição" na validação) não têm ação de um clique real hoje — viram nota
informacional com link, nunca um botão "Aplicar" fingido.

---

## Decisão de design: sugestão ≠ aviso

O mockup trata toda entrada do painel como um cartão com "Aplicar"/"Descartar". Isso só é honesto
quando existe uma mutação real por trás. Esta fase separa os dois:

- **Sugestão acionável** — tem uma função de serviço existente que a resolve
  (`saveAutomationPolicy`, `toggleChannelKillSwitch`). Cartão com **Aplicar** e **Descartar**.
- **Aviso** — informa algo que o usuário só pode resolver fora do painel (ex.: projeção de
  validação abaixo do limiar). Cartão com um link para a página relevante, sem botão de ação.

Um painel de decisão autônoma que oferece botões que não fazem nada é pior que não ter painel —
é exatamente o tipo de caixa-preta que a seção 6.5 do roadmap diz que o log de decisão existe para
evitar.

---

## Escopo

### Dentro

- Tabela `copilot_suggestions` — sugestões computadas, persistidas, com estado (não recalculadas a
  cada render, para não "piscar" entre uma sugestão vista e uma sugestão já resolvida).
- Job diário `trigger/compute-copilot-suggestions.ts` que roda as regras determinísticas (seção
  abaixo) para todo produto ativo e faz upsert de sugestões pendentes; sugestões cuja condição
  deixou de valer são marcadas `expired` automaticamente.
- Três regras de sugestão v1 (todas com ação real — ver detalhe cada uma abaixo):
  1. **Subir limite diário de um canal** — fila de `approved` parada, zero rejeição recente.
  2. **Promover canal para automação total** — taxa de aprovação humana alta e sustentada.
  3. **Reativar canal após kill switch** — switch ligado há N dias sem novo incidente.
- Um aviso v1 (sem ação, só link): validação com projeção abaixo do limiar mínimo — mesmo cálculo
  de `projectSample()` que já existe em `validation-client.tsx`, promovido para o Painel.
- Painel de decisões: lista as últimas N linhas de `decisions` de todos os produtos do usuário,
  com filtro por produto opcional.
- UI no Painel (`app/page.tsx`): painel lateral com sugestões + avisos, e a lista de decisões
  recentes abaixo ou ao lado — layout exato é decisão de implementação, o mockup mostra uma coluna
  de 306px à direita, mas o Painel de hoje não tem essa terceira coluna: avaliar se cabe como
  seção full-width abaixo do grid de métricas em vez de coluna lateral (menos redesenho de layout).
- Descartar uma sugestão grava `status = 'dismissed'` e não a recalcula por X dias mesmo que a
  condição continue valendo (evita reoferecer o que o usuário já recusou).
- Aplicar uma sugestão chama a mutação real, marca `status = 'applied'`, e grava uma linha em
  `decisions` com `actor: 'human'` — a aprovação humana também é uma decisão auditável.

### Fora

- Sugestões sobre conteúdo/ângulo/tema — já são aplicadas automaticamente pela Fase 4; não há gate
  para oferecer. Se um dia esse gate for construído (ligar `appliedToPrompt` de verdade, exigindo
  confirmação antes de pesar no prompt), é uma mudança na Fase 4, não nesta.
- Qualquer sugestão gerada por LLM interpretando dados livremente. O LLM, se usado, só recebe
  números já computados e escreve uma frase — nunca decide o quê recomendar.
- Autonomia graduada (níveis 0-4, promoção/rebaixamento automático) — é a Fase 8. Esta fase é
  puramente humano-no-loop: toda mudança de política passa por um clique explícito. Mas os dados
  gerados aqui (quantas sugestões foram aplicadas vs. descartadas, por tipo) são exatamente a
  evidência que a Fase 8 vai pedir para promover autonomia de verdade — construir isso agora
  adianta a coleta.
- Painel cross-produto de métricas agregadas (impressões/cliques/signups totais) — fora do escopo
  desta fase, é polish do Painel que pode vir separado.
- Notificação por e-mail/push de novas sugestões — a Fase 8 já prevê um "relatório semanal"; uma
  notificação de sugestão pontual pode nascer ali.

---

## Regras de sugestão (determinísticas)

### 1. Subir limite diário do canal

```text
SE status(channel) != killSwitch=true
  E count(social_posts WHERE productId, channel, status='approved') >= maxPostsPerDay * 3
  E count(publications WHERE channel, últimos 14 dias, status='failed' com erro de política) = 0
ENTÃO sugerir maxPostsPerDay += 2 (teto: nunca mais que o dobro do valor atual numa sugestão)
```

Aplicar → `saveAutomationPolicy(productId, channel, { ...policy, maxPostsPerDay: novo })`
(`app/actions/distribution.ts`, já existe).

### 2. Promover canal para automação total

```text
SE level(channel) = 'approval_required'
  E últimas 20 publicações aprovadas manualmente desse canal: >= 90% published sem rejeição
  E nenhum kill switch acionado nos últimos 30 dias
ENTÃO sugerir level = 'automatic'
```

Aplicar → `saveAutomationPolicy(productId, channel, { ...policy, level: 'automatic' })`.

### 3. Reativar canal após kill switch

```text
SE killSwitch(channel) = true E killSwitch ligado há >= 7 dias
  E nenhuma nova falha do canal desde que foi desligado
ENTÃO sugerir desligar o kill switch
```

Aplicar → `toggleChannelKillSwitch(productId, channel, false)` (já existe).

### Aviso: validação abaixo do ritmo

```text
SE validation.status = 'running'
  E projectSample(...) marca warn = true  (mesma função de validation-client.tsx)
ENTÃO aviso, sem ação — link para /products/[id]/validation
```

Os limiares exatos (3x o `maxPostsPerDay`, 20 publicações, 90%, 30 dias, 7 dias) vão para uma
config, não hardcoded — mesmo padrão da Fase 4 (`sampleSufficient` em config).

---

## Mudanças de banco

```ts
copilotSuggestionKind = pgEnum('copilot_suggestion_kind', [
  'raise_channel_rate_limit',
  'promote_channel_automation',
  'reactivate_channel',
])

copilot_suggestions {
  id, productId,
  kind: copilotSuggestionKind,
  channel: distributionChannel,           // nullable — reservado p/ tipos futuros não ligados a canal
  rationale text,                         // frase pronta, gerada em código (+ opcionalmente narrada por LLM tier cheap)
  evidence jsonb,                         // números exatos usados na regra — mesmo espírito de learnings.evidence
  proposedChange jsonb,                   // {"maxPostsPerDay": 5} ou {"level": "automatic"} etc. — o que "Aplicar" vai enviar
  confidence numeric(3,2),                // determinística, função dos mesmos números da regra
  status enum('pending','applied','dismissed','expired'),
  resolvedAt, resolvedBy text?,           // 'human' sempre, nesta fase
  computedAt, createdAt,
  unique(productId, kind, channel)        // uma sugestão pendente por tipo×canal por vez
}
```

`decisions` não muda — já serve ao painel de transparência como está.

---

## Mudanças de backend

### 1. Motor de regras — `modules/copilot/service.ts` (SQL puro, sem IA)

Uma função por regra, todas puras dado o estado do banco — testáveis sem mocks de IA, mesmo
padrão da Fase 4. `evaluateSuggestions(productId)` roda as três regras e devolve o diff a persistir
(upsert de novas, expirar as que não valem mais).

### 2. Aplicar / descartar — `app/actions/copilot.ts`

`applySuggestionAction` valida que a sugestão ainda está `pending`, chama a mutação real
correspondente ao `kind`, grava `decisions` com `actor: 'human', decision: 'APPLY_SUGGESTION'`, e
marca `status: 'applied'`. `dismissSuggestionAction` só marca `status: 'dismissed'`.

### 3. Leitura agregada de decisões — `recentDecisionsAllProducts(userId, limit)`

Hoje `recentDecisions` exige um `productId`. Nova função em
`src/lib/observability/repo.ts` sem esse filtro, restrita aos produtos do usuário autenticado.

---

## Workflows

- `trigger/compute-copilot-suggestions.ts` — diário, depois de `compute-rollups` (precisa dos
  números do dia). Idempotente: upsert por `(productId, kind, channel)`.

---

## Mudanças de UI

- `app/page.tsx` (Painel) — nova seção com sugestões pendentes (`.card` com `.tag` de confiança,
  botões `.btn-primary`/`.btn-ghost` para Aplicar/Descartar) e avisos (mesmo cartão, sem botão de
  ação, link para a página relevante) + lista de decisões recentes de todos os produtos.
- Sem tela nova dedicada — cabe inteira no Painel existente, com o vocabulário Nocturne já
  estabelecido no retrofit de design.

---

## Riscos

| Risco | Mitigação |
|---|---|
| Sugestão "Aplicar" que na verdade não faz nada perceptível | Cada regra só entra no escopo se já existir uma função de mutação real chamável — é o critério de entrada, não um ajuste depois |
| Regra dispara demais (fadiga de sugestão) | `unique(productId, kind, channel)` limita a uma sugestão pendente por combinação; descartar suprime por um período configurável |
| Limiares errados geram sugestão ruim (ex.: subir limite de canal instável) | Regra 1 exige zero falha de política nos últimos 14 dias; regra 2 exige 90% de aprovação em janela de 20 |
| Confundir isso com autonomia de verdade (Fase 8) | Toda aplicação é um clique humano explícito, nunca automática; documentado como não-objetivo |

---

## Critérios de aceite

1. O Painel mostra decisões recentes de todos os produtos do usuário sem precisar entrar em
   nenhum produto individualmente.
2. Uma sugestão só aparece quando existe uma função de mutação real que a resolve; clicar
   "Aplicar" chama essa função e o efeito é visível na página do canal em seguida.
3. Descartar uma sugestão a remove da lista e ela não reaparece imediatamente (respeita o período
   de supressão).
4. As três regras de sugestão têm teste unitário cobrindo o caso positivo e o caso exatamente na
   borda do limiar.
5. Nenhuma sugestão ou aviso contém um número que não vem de uma query real — sem número "escrito"
   por um LLM.

---

## Testes

- Motor de regras: estado semeado no banco → sugestão esperada aparece/não aparece, casos de borda
  nos limiares (Fase 4 já tem esse padrão para `sampleSufficient`, reaproveitar).
- `applySuggestionAction`: sugestão `pending` → aplica e muda o estado real de
  `automation_policies`; sugestão já `applied`/`dismissed` → rejeitada com erro, não reaplica.
- Idempotência do job: rodar duas vezes no mesmo dia não duplica sugestões nem decisões.
