# Backlog do GrowthOS

## Fase 4.5 — Validação de Ideia

### Auto-aprovação e publicação de posts de validação

**Status:** Aberto  
**Prioridade:** Média  
**Esforço:** Pequeno

Posts gerados durante o teste de demanda (validação) ficam em `pending_approval` e exigem aprovação manual antes de serem agendados e publicados nos canais (Bluesky, LinkedIn).

**Cenário ideal:** Posts com `riskReview.verdict === 'approved'` deveriam transitar automaticamente para `approved` e depois serem agendados pelo `growth-tick`, sem intervenção manual.

**Contexto:**
- Arquivo: `src/trigger/generate-validation-content.ts:154`
- Risk review já roda automaticamente e produz um veredito
- Aprovação manual é um gate de segurança intencional
- Remover exige apenas criar um job que transicione status automaticamente para posts com verdict ≠ "block"

**Implementação:**
1. Criar job `auto-approve-validation-posts.ts` que rode após `generate-validation-content`
2. Filtrar posts de validação em `pending_approval`
3. Transicionar para `approved` se `riskReview.verdict === 'approved'` ou similar
4. Deixar `growth-tick` (job existente) agendar e publicar normalmente

**Bloqueadores:** Nenhum — funcional puro, sem dependências externas

### Reescrever posts com "flag" usando feedback do risk review

**Status:** Aberto  
**Prioridade:** Alta  
**Esforço:** Médio

Posts com `riskReview.verdict === "flag"` ficam bloqueados esperando revisão manual. Melhor: mostrar botão "Reescrever com IA" na UI que:

1. Pega o feedback do risk review (`reasons` + `suggestedFix`)
2. Regenera o post levando em conta as críticas
3. Passa pelo risk review de novo
4. Se verdict = "pass" → aprova automaticamente
5. Se verdict = "flag" novamente → mostra botão pra tentar outra vez

**Contexto:**
- UI: `app/products/[id]/validation/_components/validation-client.tsx`
- A IA já identificou o problema e sugeriu a correção
- Deixar ela corrigir é mais eficiente que esperar aprovação manual

**Implementação:**
1. Criar action `rewriteValidationPost()` que recebe `postId`
2. Buscar post + risk review feedback
3. Chamar `writeValidationPost()` novamente com prompt ajustado: "considerando este feedback: {reasons} {suggestedFix}, reescreva o post"
4. Passar pelo risk review de novo
5. Se pass → auto-aprovar; se flag → deixar botão habilitado pra retry

**Timing:** Depois que auto-aprovação estiver em produção.

### Gerar posts de validação para Bluesky (não apenas LinkedIn)

**Status:** Descoberto no teste  
**Prioridade:** Alta  
**Esforço:** Pequeno

Posts de validação são gerados apenas para LinkedIn. Bluesky é o canal obrigatório do roadmap (V1). Investigar por quê Bluesky falha silenciosamente durante `generate-validation-content`.

**Contexto:**
- Arquivo: `src/trigger/generate-validation-content.ts:104`
- Código tenta gerar pra Bluesky + LinkedIn, mas só LinkedIn aparece
- Try/catch silencia erro (linha 157-159)
- Conta Bluesky conectada e funcionando (testada em Fase 1)

**Implementação:**
1. Adicionar log detalhado antes do try/catch
2. Rodar validação de novo e capturar erro
3. Ajustar `writeValidationPost()` pra gerar melhor pra Bluesky
4. Testar que ambos os canais geram

**Bloqueador atual:** Sem isso, posts só publicam em LinkedIn (ou não publicam se só Bluesky conectada).

---

## Fase 6+ — Landing Page Builder

### Auto-geração e deploy de landing pages

**Status:** Aberto  
**Prioridade:** Média  
**Esforço:** Grande  
**Depende de:** Fase 5 completa, validação estável

Usuário descreve a landing page desejada → Sistema gera com Claude Design ou Google Stitch → Deploy automático no Vercel → Domínio automático (`{productId}.vercel.app` ou custom).

**Por quê:** Fecha o loop: ideia → landing page → validação → resultados. Hoje usuário precisa ter URL pronta antes de iniciar validação.

**Contexto:**
- Integração com Claude Design (canvas editor)
- API Vercel para criar projetos/domínios
- CI/CD automático de landing pages
- Gerenciar deployments por produto

**Implementação:**
1. Criar UI "Gerar Landing Page" na tela de validação
2. Integrar Claude Design como iframe/embed
3. Usar Vercel API para criar projeto + domínio
4. Auto-deploy ao salvar
5. Atualizar campo landing_url no produto

**Timing:** Depois que Fase 5 estiver validada em produção real.
