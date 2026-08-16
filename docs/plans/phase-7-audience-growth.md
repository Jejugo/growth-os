# Fase 7 — Crescimento de audiência

> **Marco:** o sistema otimiza para **audiência qualificada**, não para número de seguidores.

> ⚠️ Plano em esboço.

---

## Objetivo

Implementar o conceito de *Qualified Audience* (seção 6): um seguidor que corresponde ao ICP vale
mais que dez que não correspondem. E o Audience Growth Engine da seção 7: aumentar exposição entre
pessoas com chance de virar cliente.

O erro que esta fase existe para evitar: um sistema que cresce a conta para 20 mil seguidores
irrelevantes e converte zero — um resultado que *parece* sucesso em todo dashboard convencional.

---

## Escopo

### Dentro

- análise de qualidade de audiência: que fração dos seguidores casa com os segmentos
- métrica de seguidores qualificados, acompanhada ao longo do tempo
- grafo de criadores e de comunidades por afinidade de audiência
- Audience Affinity Score (seção 7)
- alocação por audiência: em qual cluster investir conteúdo

### Fora (permanentemente, não "por enquanto")

Follow/unfollow automático, engajamento artificial, DMs automatizadas, compra de audiência,
qualquer forma de inflar número.

---

## Banco (esboço)

```ts
audience_members {                  // amostra, não a base inteira
  id, productId, channel, externalHandle,
  profileSnapshot jsonb,            // bio, localização, cargo — dado público
  matchedSegmentId?, qualificationScore int,
  qualifiedAt?, source enum('follower','engager','mentioned'),
  lastEvaluatedAt
}

audience_clusters {
  id, productId, name, description,
  segmentId?, size int, qualifiedRatio numeric(4,3),
  topTopics text[], topCreators text[], engagementRate numeric(5,4),
  computedAt
}

creator_profiles {
  id, productId, channel, handle,
  audienceOverlapPct numeric(5,2),  // estimado por amostragem, com intervalo declarado
  relevanceScore int, reachEstimate int,
  topics text[], notes text, lastEvaluatedAt
}

affinity_scores {
  id, productId, targetType enum('creator','community','cluster','topic'), targetId,
  audienceRelevance, problemRelevance, engagementOpportunity, productFit, channelSuitability,  // 0..1
  composite numeric(4,3),
  computedAt, inputsSnapshot jsonb
}
```

---

## Backend (esboço)

**Fórmula de afinidade** (seção 7) — determinística e auditável, cada fator entre 0 e 1:

```text
affinity = audienceRelevance × problemRelevance × engagementOpportunity
                             × productFit × channelSuitability
```

Produto, não soma: um fator perto de zero **deve** zerar o resultado. Uma comunidade enorme e
perfeitamente relevante em que não há oportunidade de participação honesta vale zero, e a fórmula
precisa dizer isso sozinha.

Os fatores vêm de dados quando existem (sobreposição medida, taxa de engajamento observada) e de
classificação `cheap` quando não existem — com a origem gravada em `inputsSnapshot`.

**Qualificação de seguidores:** amostragem, não censo. Avaliar 200–500 perfis por conta por mês, via
API oficial, classificar contra os segmentos e extrapolar com intervalo de confiança declarado. Um
número com barra de erro é honesto; um número preciso e inventado, não.

**Métrica que passa a valer no dashboard:** `qualifiedFollowers = followers × qualifiedRatio`,
com a série temporal. Crescer 5% de seguidores com o `qualifiedRatio` caindo 10% é uma piora, e o
gráfico deve mostrar isso.

**Alocação por audiência:** o plano semanal da fase 5 ganha uma dimensão — quais clusters priorizar.
Mesma mecânica de piso, teto e exploração.

---

## UI

`/products/[id]/audience` evolui: seguidores qualificados vs. totais ao longo do tempo, clusters com
tamanho e qualidade, criadores por afinidade, investimento atual por segmento.

---

## Riscos

| Risco | Mitigação |
|---|---|
| Coleta de perfis vira vigilância | Só dado público, só amostra, retenção limitada, finalidade documentada |
| Estimativa de sobreposição imprecisa | Intervalo de confiança sempre exibido; nenhuma decisão automática com amostra pequena |
| Limites de API de plataforma | Amostragem lenta e respeitosa; falha de coleta degrada a métrica, não o sistema |
| Recair em otimização de vaidade | `qualifiedFollowers` é a métrica de topo; seguidores brutos aparecem em cinza, ao lado |

---

## Critérios de aceite

1. O sistema estima o `qualifiedRatio` de cada conta com intervalo de confiança.
2. A série temporal de seguidores qualificados existe e é a métrica principal da tela de audiência.
3. O Audience Affinity Score é reproduzível a partir do `inputsSnapshot` gravado.
4. Nenhum código do sistema é capaz de seguir, curtir ou enviar mensagem — a capacidade não existe
   nos adapters, verificado por teste.
5. Os clusters priorizados influenciam o plano semanal de forma visível e explicável.
