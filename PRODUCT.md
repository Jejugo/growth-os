# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Jeff, o fundador, sozinho. Ele opera vários SaaS próprios (ex.: Warmline) a partir de um único
dashboard do GrowthOS. Não é um produto multi-tenant nem tem outros operadores hoje — é
explicitamente uma ferramenta interna de um fundador só.

## Product Purpose

GrowthOS é uma plataforma autônoma de crescimento e distribuição para produtos SaaS próprios do
fundador. Ele cola a URL de um SaaS e define um objetivo de crescimento (Growth Mission); a
plataforma analisa o produto, identifica audiências, define estratégia de conteúdo, gera conteúdo
nativo de cada plataforma, distribui pelos canais suportados, acompanha conversões, aprende com os
resultados e melhora a estratégia progressivamente. Sucesso = os SaaS do fundador crescendo
sozinhos, sem parecer spam, com o mínimo de esforço manual de manutenção possível.

## Positioning

O mecanismo que uma ferramenta de agendamento (Buffer, Hypefury) mais um redator não reproduz: um
loop fechado e automático — analisa o produto, testa ângulos de posicionamento reais, publica,
mede conversão de verdade (visitas, inscrições, sinais fortes) e usa isso pra decidir o próximo
lote sozinho. Não é um humano decidindo o que postar toda semana; é o sistema aprendendo com o
resultado de cada rodada.

## Operating Context

Fluxo principal: adicionar URL do SaaS → analisar produto → revisar Product Profile → definir
Growth Mission → identificar audiências → estratégia de conteúdo → gerar conteúdo → agendar/aprovar
→ publicar → acompanhar visitas/conversões → analisar resultados → melhorar estratégia futura. O
sistema preserva decisões e conteúdo histórico — não decide de forma stateless a cada rodada.

Cada produto passa por estágios (`idea → validating → building → launched`), com uma regra de
porta no roadmap: só avança de fase depois de rodar em uso real por pelo menos uma semana. Em
`validating`, a geração de conteúdo testa ângulos de posicionamento por experimento; só em
`launched` entra o pipeline genérico de campanha semanal contínua ("Planejar semana").

Canais de distribuição hoje: Bluesky (implementado, é o canal V1 obrigatório do roadmap),
LinkedIn (`manual_assist`, sem API aprovada ainda), Reddit (só rascunho, sem publicação nesta
fase). Todo canal começa em política `approval_required` (exige revisão antes de publicar) — só
passa pra `automatic` depois de um período sem incidente.

## Capabilities and Constraints

- **Restrição inegociável, aplicada em código, não só em prompt:** o sistema nunca pode se
  comportar como spam bot — sem mass-follow/unfollow, engajamento artificial, personas falsas,
  depoimentos falsos, votação automatizada, comentários repetitivos, postagem indiscriminada de
  link, ou tentativa de burlar moderação/rate limit de plataforma.
- Escopo deliberadamente fora do MVP (fases 0–4): billing, times, permissões complexas,
  autenticação enterprise, white-labeling, arquitetura multi-tenant, onboarding elaborado.
- Limitação conhecida atual: canais em `approval_required` ainda não têm um botão de "publicar
  agora" na UI — a aprovação sozinha não dispara a publicação de fato.
- O fundador precisa poder editar manualmente qualquer suposição gerada por IA no Product
  Profile.

## Brand Commitments

Nome do produto: **GrowthOS**. Sem logo, guia de voz ou outros ativos de marca definidos ainda —
não inventar identidade visual ou tom além disso.

## Evidence on Hand

Produto real hoje conectado ao GrowthOS: **Warmline** — único com conta de canal real conectada
(Bluesky) e posts de fato publicados (3 posts, publicados manualmente durante o teste do pipeline
em 2026-09-14). Não há depoimentos, cases, imprensa ou dados de pricing reais no repositório —
nenhum desses deve ser inventado em trabalho futuro.

## Product Principles

- Relevância e comportamento nativo de plataforma vêm antes de volume — nunca mass-follow,
  engajamento falso ou spam, mesmo que isso signifique crescer mais devagar.
- Um fundador opera vários produtos de um único lugar — nenhuma feature deve introduzir
  complexidade de time/permissão que esse caso de uso solo não precisa.
- Uma fase só avança depois de rodar em uso real por pelo menos uma semana — não assumir que
  código pronto significa fase pronta.
- O sistema preserva histórico de decisões e conteúdo para não se comportar de forma stateless.
- "Não fazer nada" (NO_ACTION) é um resultado de primeira classe do sistema, não uma falha —
  melhor não publicar do que publicar algo fora de contexto ou fora de estágio.
