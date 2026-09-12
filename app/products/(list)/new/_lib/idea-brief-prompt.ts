/**
 * Prompts estáticos (sem dado dinâmico — ainda não existe produto nenhum nesta tela) pra ajudar o
 * fundador a chegar nos campos que o formulário de baixo pede. As perguntas espelham exatamente os
 * campos e as dicas já usados no formulário (`ProductBrief`), pra quem copiar a resposta de volta
 * preencher certo de primeira. Dois pontos de partida diferentes: uma ideia ainda solta na cabeça
 * (`IDEA_BRIEF_PROMPT`), ou um projeto que já está em construção e cuja IA (ex.: Claude Code) já
 * enxerga o código (`PROJECT_BRIEF_PROMPT`).
 */
export const IDEA_BRIEF_PROMPT = `Me ajude a estruturar uma ideia de produto SaaS pra testar demanda real antes de construir. Vou te contar a ideia em linguagem solta — sua tarefa é me devolver estas respostas, curtas e específicas (as duas últimas são opcionais):

1. Nome da ideia — um nome de trabalho, não precisa ser definitivo.
2. Problema — que dor, de quem. Uma frase, na linguagem de quem sente a dor, sem jargão de vendas.
3. Audiência-alvo — cargo, contexto, tamanho de empresa. Nunca um rótulo genérico como "empresas" ou "profissionais".
4. Esboço de solução — o que o produto faria, em termos simples, sem enumerar funcionalidades.
5. Hipótese mais arriscada — o que precisa ser verdade pra essa ideia funcionar. É a única coisa que o teste de demanda vai realmente tentar derrubar — seja honesto sobre o que é mais incerto, não sobre o que soa mais seguro.
6. (Opcional) Por que agora — o que mudou que torna essa ideia possível ou urgente hoje.
7. (Opcional) Alternativas hoje — o que a pessoa faz hoje sem esse produto. Vale "planilha" ou "nada".

Não invente prova, número ou funcionalidade que eu não tenha mencionado — se faltar informação pra alguma resposta, pergunte antes de supor.

Minha ideia, em linguagem solta:
[cole aqui uma descrição livre da sua ideia — pode ser bagunçado, é pra isso que estou perguntando]

Devolva as 7 respostas numeradas, cada uma pronta pra eu colar direto no campo correspondente de um formulário.`

export const PROJECT_BRIEF_PROMPT = `Você já tem acesso ao projeto que estou construindo — código, documentação, histórico de commits. Baseado nisso (não em uma descrição que eu vá te dar agora), me ajude a responder estas 7 perguntas pra eu cadastrar esta ideia num teste de demanda. Extraia o que puder diretamente do projeto; só me pergunte de volta o que não der pra inferir com confiança (as duas últimas são opcionais):

1. Nome da ideia — o nome do produto/projeto atual, ou um nome de trabalho se ainda não tiver um definido.
2. Problema — que dor, de quem, este projeto resolve. Uma frase, na linguagem de quem sente a dor, sem jargão de vendas.
3. Audiência-alvo — cargo, contexto, tamanho de empresa de quem o projeto foi pensado pra atender. Nunca um rótulo genérico como "empresas" ou "profissionais".
4. Esboço de solução — o que o projeto faz hoje (ou o que pretende fazer), em termos simples, sem enumerar funcionalidades.
5. Hipótese mais arriscada — o que precisa ser verdade pra essa ideia funcionar, considerando o que já foi construído até aqui. Seja honesto sobre o que é mais incerto, não sobre o que soa mais seguro.
6. (Opcional) Por que agora — o que mudou que torna este projeto possível ou urgente hoje.
7. (Opcional) Alternativas hoje — o que a audiência-alvo faz hoje sem esse produto. Vale "planilha" ou "nada".

Não invente prova, número ou funcionalidade que não esteja no projeto ou que eu não tenha confirmado — se faltar informação pra alguma resposta, pergunte antes de supor.

Devolva as 7 respostas numeradas, cada uma pronta pra eu colar direto no campo correspondente de um formulário.`
