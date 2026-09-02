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
