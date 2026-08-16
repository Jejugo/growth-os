# Fase 8 — GrowthOS autônomo

> **Marco:** o loop completo roda sozinho por semanas, e eu confio nele o suficiente para só olhar.

> ⚠️ Plano em esboço. Esta fase é menos construção nova e mais **fechamento, confiança e
> autonomia graduada**.

---

## Objetivo

Unir o que as fases 0–7 construíram num ciclo contínuo:

```text
Missão → descoberta de audiência → estratégia → conteúdo → distribuição
   → conversões → experimentos → aprendizado → ajuste de estratégia → (repete)
```

Ao final, decidir se a ferramenta interna vira SaaS comercial.

---

## O que ainda falta construir

A maior parte das peças já existe. O que não existe:

**1. Orquestrador de ciclo.** Hoje há vários crons independentes (tick, rollups, aprendizados,
planejamento, descoberta). Vira uma máquina de estados semanal explícita por produto, com um estado
observável em uma tela: `planning → producing → distributing → measuring → learning → replanning`.
Ciclo travado é visível; hoje seria silencioso.

**2. Autonomia graduada.** Confiança é conquistada por evidência, não configurada num toggle:

```text
Nível 0  tudo requer aprovação
Nível 1  publicação automática em canais de baixo risco; resto aprovado
Nível 2  + escolha automática de tema e cadência
Nível 3  + realocação automática de canal e conclusão de experimentos
Nível 4  + criação e encerramento automático de campanhas
```

A promoção de nível exige métricas objetivas: N semanas sem incidente, taxa de aprovação humana
acima de X%, zero violação de política, atribuição saudável. **Rebaixamento é automático** diante de
qualquer incidente — e é o rebaixamento automático, não a promoção, que torna a autonomia segura.

**3. Detecção de anomalias e freio.** Queda abrupta de conversão, pico de rejeição, erro repetido em
canal, custo por aquisição acima do teto → o autopilot se pausa sozinho e avisa. Um sistema autônomo
sem freio próprio é apenas um sistema rápido para errar.

**4. Relatório semanal.** Um resumo enviado por e-mail: o que foi feito, o que funcionou, o que
mudou na estratégia, o que precisa de atenção. É a interface de confiança de quem não quer abrir o
dashboard todo dia — e é o que revela, na prática, se o sistema está fazendo algo defensável.

**5. Economia unitária.** Fechar a conta da seção 30: `custo de infraestrutura ÷ clientes
adquiridos`, por produto e por canal, com histórico. É o número que decide se o GrowthOS vale a
pena — e o único honesto para uma eventual decisão de comercialização.

---

## Banco (esboço)

```ts
autonomy_levels { productId, level int, promotedAt, demotedAt?, reason text, metricsSnapshot jsonb }
growth_cycles   { id, productId, missionId, weekOf, state, startedAt, endedAt?, summary jsonb }
anomalies       { id, productId, kind, severity, detectedAt, resolvedAt?, autoPausedAutopilot bool, details jsonb }
unit_economics  { id, productId, windowKind, llmCost, infraCost, externalCost,
                  customersAcquired, costPerCustomer numeric(12,2), computedAt }
```

---

## Critérios de aceite

1. Um produto roda 4 semanas seguidas em nível 2+ sem intervenção manual não planejada.
2. O estado do ciclo é visível e um ciclo travado gera alerta em menos de 1 hora.
3. Promoção e rebaixamento de nível acontecem por regra, com registro do motivo.
4. Uma anomalia injetada em teste pausa o autopilot e notifica.
5. O relatório semanal chega e descreve corretamente o que aconteceu.
6. O custo por cliente adquirido é calculado por produto e por canal.
7. Todo o histórico de decisões autônomas de uma semana é auditável em uma tela.

---

## Decisão de comercialização

Só depois de 3 meses de operação estável em 2+ produtos. As perguntas a responder com dados, não com
entusiasmo:

- o custo por cliente adquirido é competitivo com as alternativas de crescimento?
- funciona em produtos com ICP diferente do primeiro, ou o sistema está sobreajustado a ele?
- quanto tempo humano por semana o sistema realmente consome? (a promessa é autonomia, e o número
  honesto é o que testa a promessa)
- o que impede um concorrente de reproduzir isso em três meses?

Se a decisão for comercializar, aí sim entram os itens deliberadamente adiados na seção 2:
multi-tenancy, billing, times, onboarding. Nenhum deles antes desse ponto — e nenhum deles é mais
difícil de acrescentar depois do que teria sido caro carregar durante oito fases.
