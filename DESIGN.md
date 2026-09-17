# GrowthOS — Direção visual

<!-- impeccable:design-system -->

GrowthOS usa o Nocturne como base, amplificado com a precisão operacional de Linear, Stripe Dashboard e Raycast/Arc. A interface serve um fundador solo no modo Operate: estado, decisão e próxima ação vêm antes de expressão visual.

## Princípios

- **Elevação antes de borda:** três níveis de superfície — base (`surface`), elevada (`elevated`) e flutuante (`floating`) — comunicam profundidade com brilho de fundo e sombra sutil. `border-line` fica reservado a divisores estruturais, frames de preview e estados críticos.
- **Cor como sinal:** o accent saturado é reservado à ação que exige atenção agora, CTAs primários e estados críticos. Atenção usa `--accent-gradient` e `--accent-glow`; o restante permanece neutro/dessaturado.
- **Tipografia para contexto:** brief, descrição e texto somente leitura usam espaçamento, peso e escala; não recebem cartão decorativo. Superfícies elevadas ficam para listas comparáveis, filas, canais, campanhas e áreas de ação.
- **Cabeçalho/nav atmosféricos:** cabeçalhos e navegação podem usar gradiente de fundo e blur sutil para separar o cockpit sem criar uma faixa chapada.
- **Densidade intencional:** decisões e filas são densas; contexto é espaçado. Cada tela operacional explicita estado, “Precisa de você” e próxima ação.

## Tokens e componentes

- `--color-surface` / `surface-elevated` / `surface-floating` definem a hierarquia de superfícies.
- `--shadow-sm`, `--shadow-md` e `--shadow-lg` são sombras com deslocamento e blur, nunca halos sem profundidade.
- `.operations-header`, `.operations-attention` e `.operations-next` formam o cabeçalho compartilhado do funil Canais → Conteúdo → Campanhas → Validação → Landing.
- `.btn-primary` usa gradiente leve e glow apenas em hover/atenção; botões secundários permanecem neutros.
- Foco visível, seleção de texto, caret e alvos de toque fazem parte da superfície entregue.

## Limites

- Não introduzir gradientes em texto, decoração ou todos os estados.
- Não transformar contexto de leitura em card por padrão.
- Não substituir informação por efeito visual; status e ações devem continuar explícitos em texto.
- Validar responsividade em mobile compacto, teclado e zoom antes de novas ampliações.
