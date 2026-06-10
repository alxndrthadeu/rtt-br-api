# Épico: Orçamento de Draft

> Documento de produto (PO). As **histórias** ao final são especificações de execução para **agentes de codificação Claude** — escritas para serem autossuficientes (o agente não vê esta conversa).

---

## 1. Contexto do produto (para quem chega agora)
RTT BR API é o backend (NestJS 10 + Prisma/PostgreSQL) de um jogo de fantasy do Brasileirão histórico. O jogador monta um elenco (draft) com craques de eras passadas (80s, 90s, 00s, 10s, 20s), define formação e simula uma temporada de 38 rodadas. O draft é salvo via `POST /draft` (`src/draft/draft.controller.ts` → `DraftService.create`), com payload `{ game_id, players: [{ player_id, slot_pos, slot_index }] }`. Cada `Player` tem `overall` (1–99). **Hoje não há nenhuma restrição na montagem** — é possível escalar 11 jogadores de overall 99.

**Problema de produto:** sem limite, a estratégia ótima é "pegue só os maiores overalls". Não há trade-off, todos os times convergem para os mesmos craques e o draft perde graça e variedade.

---

## 2. Objetivo
Introduzir um **orçamento de draft** (teto de "custo" do elenco, derivado do `overall`) validado na montagem. O jogador passa a fazer escolhas reais: cada estrela cara "consome" o orçamento e obriga a equilibrar com jogadores mais baratos. Cria escassez, decisão estratégica e valoriza joias de overall médio bem posicionadas.

**Não-objetivo:** economia de moedas/lojas, packs, progressão entre temporadas, autenticação. Apenas o teto de montagem.

---

## 3. Hipótese de valor
> **Acreditamos que** impor um teto de custo ao elenco **para** jogadores que hoje escalam só superastros **vai resultar em** drafts mais variados e decisões mais estratégicas (mais joias médias aproveitadas).
> **Saberemos que é verdade quando** a concentração nos top-overalls cair e a diversidade de jogadores escalados aumentar, sem queda na taxa de conclusão de draft.

Premissa: o teto precisa ser **calibrado** para permitir 1–2 estrelas + elenco de apoio — restritivo o bastante para forçar escolha, generoso o bastante para não frustrar.

---

## 4. Métricas de sucesso
**Primárias**
- **Diversidade de elenco:** aumento ≥ 25% no nº de jogadores distintos escalados na base; queda na % de aparições do top-10 overall.
- **Trade-off real:** distribuição de overall por elenco deixa de ser concentrada no topo (mais "barriga" de overalls médios).

**Guarda-corpo (não pioram)**
- **Conclusão de draft:** taxa de `POST /draft` bem-sucedido não cai (teto não pode ser tão apertado que trave a montagem).
- **Clareza de erro:** rejeições por orçamento retornam mensagem acionável (quanto excedeu), não erro genérico.
- **Performance/estabilidade:** validação é O(nº de jogadores do elenco); sem regressão de latência nem 5xx.

---

## 5. Modelo de design do Orçamento (especificação funcional)
Comportamento desejado. Constantes **calibráveis**, isoladas num único arquivo.

**Custo de um jogador:** na v1, custo linear = `overall`. (Alternativa futura: custo convexo com prêmio para elite, ex.: `overall + max(0, overall-85)²×K`, para tornar superastros desproporcionalmente caros — fora do escopo da v1, registrar como evolução.)

**Custo do elenco:** soma dos custos dos jogadores escalados no draft.

**Teto (BUDGET):** valor único, calibrável, dimensionado para um elenco padrão de 11 jogadores. Default sugerido: **950** (permite ~1–2 estrelas 90+ e o restante 80–88). Tunável; documentar a premissa no código.

**Regra de validação:** `custoElenco ≤ BUDGET`. Se exceder, a montagem é **rejeitada** com mensagem clara (custo atual, teto e excedente).

**Observação sobre tamanho do elenco:** se o nº de jogadores drafteados variar por formação, o teto pode ser proporcional ao nº de slots (`BUDGET_POR_SLOT × nSlots`). Na v1, manter teto fixo para 11; se a base usar consistentemente 11 titulares, isso basta. Decidir com o time se há formações com nº diferente de jogadores.

---

## 6. Escopo
**Dentro:** função de custo/orçamento (domínio puro), validação na criação do draft (`POST /draft`), e endpoint de pré-checagem para o frontend validar ao vivo.
**Fora:** custo convexo (evolução), orçamento por formação variável (a confirmar), moedas/lojas/packs, persistência de "orçamento gasto", UI.

---

## 7. Sequenciamento e dependências
1. **ORC-1** (núcleo de custo/orçamento — sem efeito colateral) → base.
2. **ORC-2** (validar no `POST /draft`) e **ORC-3** (pré-checagem para o front) dependem de ORC-1; podem ir em paralelo.

---

## 8. Histórias (especificações para agentes Claude)

> **Convenções para todas as histórias:**
> - Sem infra de testes (sem Jest/eslint). Verificação obrigatória: `npx tsc --noEmit` (exit 0) e `npm run build` (verde). Não instale Jest/eslint.
> - Stack: NestJS 10, Prisma 7 (driver adapter). `tsconfig` com `strictNullChecks:false`/`noImplicitAny:false` — não os ative.
> - Não altere comportamento existente fora do que a história pede. Sem over-engineering.
> - Uma branch por história, commits atômicos. Marque a história como ✅ neste arquivo ao concluir.

---

### ORC-1 — Núcleo de custo e orçamento (função pura)

**Contexto:** precisamos de um módulo isolado e determinístico que calcule o custo de um elenco e diga se está dentro do orçamento, conforme a seção 5 deste documento (`epics/EPIC-orcamento-de-draft.md`). Sem Prisma, sem Nest, sem I/O.

**Objetivo:** criar a lógica pura de custo/orçamento.

**Arquivos/locais:** criar `src/budget/budget.ts` (lógica pura). Não criar módulo Nest ainda.

**Especificação:**
- Constantes no topo, nomeadas e calibráveis: `BUDGET` (default 950) e a função de custo.
- `playerCost(overall: number): number` → v1 linear: retorna `overall`.
- `squadCost(overalls: number[]): number` → soma dos custos.
- `budgetStatus(overalls: number[]): { cost: number; budget: number; remaining: number; withinBudget: boolean; overBy: number }` onde `remaining = budget - cost`, `withinBudget = cost <= budget`, `overBy = max(0, cost - budget)`.

**Critérios de aceite (verificáveis):**
- Elenco vazio → `cost = 0`, `withinBudget = true`, `remaining = BUDGET`.
- 11×99 → `cost = 1089` > 950 → `withinBudget = false`, `overBy = 139`.
- Funções determinísticas, sem acesso a Prisma/rede/ambiente.

**Verificação:** `npx tsc --noEmit` (0) + `npm run build`. Para validar a lógica, crie um script temporário com `tsx`, confira a saída e **apague antes do commit** (não versione).

**Restrições / fora de escopo:** não tocar em controllers/services/schema; sem dependências novas; custo convexo fica fora (v1 é linear).

---

### ORC-2 — Validar orçamento na criação do draft

**Contexto:** com o núcleo (ORC-1) pronto, o `POST /draft` deve **rejeitar** elencos acima do teto. Hoje `DraftService.create` apenas faz `createMany` sem checar nada. Os custos dependem do `overall` de cada `player_id`, que não vem no payload — é preciso buscá-los.

**Objetivo:** validar o custo do elenco contra `BUDGET` antes de persistir o draft.

**Arquivos/locais:** `src/draft/draft.service.ts` (`create`). Reusar `budgetStatus`/`squadCost` de `src/budget/budget.ts`.

**Especificação:**
- Em `create`, antes do `createMany`: buscar os `overall` dos `player_id` do payload (`prisma.player.findMany({ where: { id: { in: ids } }, select: { id: true, overall: true } })`).
- Calcular `budgetStatus` com os overalls. Se `withinBudget === false`, lançar `BadRequestException` com mensagem acionável incluindo `cost`, `budget` e `overBy` (ex.: "Elenco custa 1089, teto é 950 (excedeu 139)").
- Se algum `player_id` não existir no banco, lançar `BadRequestException` clara (não silenciar).
- Se dentro do orçamento, seguir com o `createMany` atual sem alterações.

**Critérios de aceite:**
- `POST /draft` com elenco dentro do teto → 201/200 e persiste como hoje.
- `POST /draft` acima do teto → **400** com mensagem informando custo/teto/excedente; **nada** é persistido.
- `player_id` inexistente → 400 claro.
- Nenhuma mudança no `GET /draft/:gameId`.

**Verificação:** `npx tsc --noEmit` (0) + `npm run build`. Com banco: enviar um elenco caro e confirmar 400 sem linhas criadas em `drafts`; enviar um válido e confirmar persistência.

**Restrições / fora de escopo:** não alterar o schema; não mudar o shape de resposta do sucesso; não validar posições/formação (outro escopo).

---

### ORC-3 — Pré-checagem de orçamento para o frontend

**Contexto:** o frontend precisa mostrar o orçamento gasto/restante **enquanto** o jogador monta o time, antes de salvar. Endpoint de leitura/cálculo que recebe uma lista de `player_id` e devolve o status de orçamento.

**Objetivo:** expor um endpoint que calcule o `budgetStatus` de um conjunto de jogadores proposto.

**Arquivos/locais:** `src/draft/draft.controller.ts` e `src/draft/draft.service.ts`; novo DTO em `src/draft/dto/`. Reusar `src/budget/budget.ts`.

**Especificação:**
- Novo DTO `PreviewBudgetDto` com `player_ids: string[]` (validar com `class-validator`: `@IsArray`, `@IsUUID('all', { each: true })`).
- Novo método no service, ex.: `previewBudget(playerIds: string[])`, que busca os overalls e retorna `budgetStatus`.
- Novo endpoint **POST** `POST /draft/budget/preview` (POST por receber corpo com lista). Controller só delega.
- Lista vazia → status com `cost: 0`, `withinBudget: true`.

**Critérios de aceite:**
- `POST /draft/budget/preview` com `player_ids` válidos → `{ cost, budget, remaining, withinBudget, overBy }`.
- IDs inexistentes → erro 400 claro (consistente com ORC-2) ou ignorados de forma documentada; escolher uma e deixar explícito no PR (preferência: 400 claro).
- Não altera endpoints existentes.

**Verificação:** `npx tsc --noEmit` (0) + `npm run build`. Com banco: comparar preview de um elenco caro (`withinBudget:false`) vs. barato (`true`).

**Restrições / fora de escopo:** sem schema novo; sem persistência; não duplicar a regra de custo (reusar `budget.ts`).

---

## 9. Riscos e mitigações
- **Teto mal calibrado (trava ou é irrelevante):** constante `BUDGET` isolada e ajustável; instrumentar custo médio dos drafts para calibrar.
- **Regra duplicada em dois pontos (ORC-2 e ORC-3):** ambos reusam `src/budget/budget.ts` — fonte única.
- **Tamanho de elenco variável por formação:** decidir com o time se o teto deve ser proporcional ao nº de slots; v1 assume 11.
- **Interação com Química de Elenco (Épico 1):** orçamento + química se reforçam (restrição + decisão); validar em conjunto no balanceamento.

## 10. Definição de pronto (épico)
- ORC-1..3 entregues, `tsc`+`build` verdes.
- `POST /draft` rejeita elenco acima do teto com mensagem clara; válido persiste como antes.
- Frontend consegue prever orçamento via `POST /draft/budget/preview`.
- Custo médio de draft instrumentado para calibração; este documento atualizado com histórias concluídas.
