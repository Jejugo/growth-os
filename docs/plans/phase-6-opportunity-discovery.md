# Fase 6 — Descoberta de oportunidades

> **Marco:** o sistema encontra pessoas que já estão fazendo a pergunta que o produto responde, em
> vez de só transmitir conteúdo.

> ⚠️ Plano em esboço. É a fase de maior risco reputacional do projeto — releia a seção 1 do
> `init.md` inteira antes de começar.

---

## Objetivo

Sair do modo broadcast. Encontrar demanda existente — perguntas, discussões, comunidades,
criadores — e recomendar uma ação útil. Com **humano no circuito por padrão**.

A pergunta que define esta fase não é "como automatizar participação em comunidades". É "como
encontrar as dez conversas da semana em que a resposta honesta é útil". A primeira leva a banimento;
a segunda, a clientes.

---

## Escopo

### Dentro

- fontes monitoradas, cadastradas explicitamente (subreddits, feeds RSS, Hacker News, buscas
  públicas, blogs, newsletters) — nada de varredura ampla da web (seção 8: MVP não precisa disso)
- classificação e scoring de oportunidades
- perfis de comunidade com política de autopromoção e de link (seção 14)
- decisão de ação: `POST | COMMENT | ANSWER_WITHOUT_LINK | SUGGEST_HUMAN | NO_ACTION`
- fila de oportunidades com aprovação humana obrigatória

### Fora (mantido fora deliberadamente)

Comentários automáticos, engajamento automatizado, DMs, outreach a criadores, bots de navegador,
monitoramento em escala web, qualquer coisa que crie identidade ou simule usuário.

---

## Banco (esboço)

```ts
sources {
  id, productId,
  kind enum('subreddit','rss','hn','forum','newsletter','blog','search_query'),
  identifier text, config jsonb,
  pollIntervalMinutes int, lastPolledAt?, lastItemAt?,
  status enum('active','paused','error'),
}

source_items {                        // cache bruto; dedupe por externalId
  id, sourceId, externalId, url, title, body text, author text,
  publishedAt, fetchedAt, contentHash,
  unique(sourceId, externalId)
}

opportunities {
  id, productId, sourceItemId?, channel, sourceUrl?,
  type enum('question','discussion','complaint','comparison','content_gap','creator_post'),
  title, summary,
  audienceSegmentId?,
  relevanceScore int, riskScore int, potentialValueScore int,
  suggestedAction enum('POST','COMMENT','ANSWER_WITHOUT_LINK','SUGGEST_HUMAN','NO_ACTION'),
  suggestedResponse text?,
  status enum('new','approved','dismissed','acted','expired'),
  expiresAt,                           // oportunidade velha não é oportunidade
  aiCallId, discoveredAt
}

community_profiles {
  id, name, platform, topics text[], audienceSegmentIds uuid[],
  selfPromotionPolicy enum('forbidden','restricted','tolerated','welcome'),
  linkPolicy enum('never','after_contribution','contextual','allowed'),
  notes text, riskScore int, rulesSnapshot text, lastUpdatedAt
}
```

---

## Backend (esboço)

**Funil de filtragem em três estágios** — o volume bruto é grande e o LLM caro:

```text
1. filtro por palavra-chave (SQL, custo zero)     → descarta ~95%
2. classificação relevante/irrelevante (cheap)     → descarta ~80% do resto
3. scoring e ação sugerida (strong)                → só o que sobrou
```

**Scoring:** `relevance` e `potentialValue` vêm do modelo com evidências; `risk` é
**majoritariamente determinístico** — política da comunidade, idade da conta, histórico de
participação, presença de link, se o tópico é sensível. Risco não é assunto para julgamento
subjetivo de LLM quando existe regra escrita.

**Regras rígidas em código, não em prompt:**

- comunidade com `selfPromotionPolicy='forbidden'` nunca recebe sugestão com link — o LLM nem
  chega a ser consultado sobre isso;
- primeira interação numa comunidade é sempre `SUGGEST_HUMAN`;
- `ANSWER_WITHOUT_LINK` é o default para qualquer comunidade `restricted`;
- teto de N oportunidades por comunidade por semana.

**Aprovação humana obrigatória nesta fase inteira.** Nenhuma oportunidade vira ação sem clique.
Promoção para semiautônomo, se acontecer, é assunto da fase 8 e só depois de meses de histórico.

**`rulesSnapshot`**: as regras da comunidade são coletadas e guardadas. Uma sugestão que viole a
regra escrita é bloqueada com a citação da regra na tela.

---

## UI

`/products/[id]/opportunities` — fila ordenada por valor potencial, com risco visível. Cada card:
contexto original, por que é relevante, ação sugerida, rascunho de resposta, política da comunidade.
Ações: aprovar (gera rascunho no kanban), descartar com motivo, abrir o original.

---

## Riscos

| Risco | Mitigação |
|---|---|
| Banimento em comunidade | Aprovação humana, primeira interação sempre humana, `rulesSnapshot`, tetos |
| Percepção de spam mesmo com aprovação | Preferir `ANSWER_WITHOUT_LINK`; medir participação com e sem link |
| Custo de LLM explode com volume de fontes | Funil de três estágios + orçamento por produto |
| Termos de uso de plataformas | Só APIs oficiais e feeds públicos. Nada de scraping de área logada, nada de navegador automatizado |
| Fila grande demais para revisar | Teto diário de oportunidades apresentadas; qualidade acima de volume |

---

## Critérios de aceite

1. Cadastrar 5 fontes e receber oportunidades relevantes em 24h.
2. Menos de 30% das oportunidades apresentadas são descartadas como irrelevantes.
3. Nenhuma sugestão com link em comunidade `forbidden` — verificado por teste.
4. Toda oportunidade traz link para o conteúdo original e justificativa de relevância.
5. Nenhuma ação é executada sem aprovação humana explícita — verificado por teste.
6. Aprovar uma oportunidade cria um rascunho que passa pelos mesmos gates de risco e dedupe da fase 1.
