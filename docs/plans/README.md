# GrowthOS — Plano de Implementação

Plano derivado de [`init.md`](../../init.md). Cada fase é um documento independente que segue o
template da seção 32 do `init.md` (Estado atual → Objetivo → DB → Backend → UI → Workflows →
Integrações → Riscos → Critérios de aceite).

## Documentos

| # | Documento | Objetivo em uma frase | Status |
|---|-----------|----------------------|--------|
| — | [00-roadmap.md](./00-roadmap.md) | Arquitetura de referência, stack, convenções e decisões transversais | 📋 Planejado |
| 0 | [phase-0-foundation.md](./phase-0-foundation.md) | Colar uma URL de SaaS e obter um Product Profile persistente e editável | ✅ Implementado |
| 1 | [phase-1-content-engine.md](./phase-1-content-engine.md) | Gerar uma semana coerente de conteúdo para um produto | ✅ Implementado |
| 2 | [phase-2-distribution.md](./phase-2-distribution.md) | Publicar de forma confiável em um canal real | ✅ Implementado |
| 3 | [phase-3-attribution.md](./phase-3-attribution.md) | Saber qual conteúdo gera cliques e signups | ✅ Implementado |
| 4 | [phase-4-learning.md](./phase-4-learning.md) | Fazer o conteúdo futuro mudar por causa do desempenho passado | ✅ Implementado |
| 4.5 | [phase-4.5-idea-validation.md](./phase-4.5-idea-validation.md) | Inserir uma ideia sem produto, testar demanda real e receber um veredito com evidência | ✅ Implementado |
| 4.6 | [phase-4.6-copiloto.md](./phase-4.6-copiloto.md) | Transformar o log de decisões e os dados já coletados em recomendações de um clique no Painel | 📋 Planejado |
| 5 | [phase-5-growth-missions.md](./phase-5-growth-missions.md) | Raciocinar a partir de objetivos de negócio, não de instruções de post | 📋 Planejado |
| 6 | [phase-6-opportunity-discovery.md](./phase-6-opportunity-discovery.md) | Encontrar demanda existente em vez de só transmitir conteúdo | 📋 Planejado |
| 7 | [phase-7-audience-growth.md](./phase-7-audience-growth.md) | Crescer a audiência certa, não o número de seguidores | 📋 Planejado |
| 8 | [phase-8-autonomous.md](./phase-8-autonomous.md) | Fechar o loop autônomo missão → estratégia → execução → aprendizado | 📋 Planejado |

**MVP = Fases 0 → 4.** As fases 4.5 e 4.6 foram inseridas depois do MVP: não fazem parte dele e têm
pré-condições próprias (ver cada documento). As fases 5–8 são intencionalmente menos detalhadas: o
plano delas será reescrito com o conhecimento adquirido nas fases anteriores. Não implemente nada delas antes da
hora (regra 3 da seção 31 do `init.md`).

## Como usar este plano

1. Leia [`00-roadmap.md`](./00-roadmap.md) antes de escrever qualquer código.
2. Trabalhe uma fase por vez. Não comece a fase N+1 com a fase N instável.
3. No início de cada fase, revise o documento da fase contra o estado real do código e atualize-o.
4. Ao terminar, marque a fase como ✅ nesta tabela e registre os desvios em uma seção
   `## Retrospectiva` no fim do documento da fase.

## Definição de pronto (por fase)

Uma fase só está pronta quando:

- todos os critérios de aceite do documento passam manualmente;
- os testes listados na fase existem e passam em CI;
- migrations rodam do zero e sobre um banco com dados;
- não há TODO bloqueante nem feature flag ligada "temporariamente";
- o documento da fase foi atualizado para refletir o que foi realmente construído.
