# Épico: Desafios Semanais + Cartão de Temporada

> Documento de produto (PO). As **histórias** ao final são especificações de execução para **agentes de codificação Claude** — escritas para serem autossuficientes (o agente não vê esta conversa).

---

## 1. Contexto do produto (para quem chega agora)
RTT BR API é o backend (NestJS 10 + Prisma/PostgreSQL) de um jogo de fantasy do Brasileirão histórico. O jogador cria um game (`POST /game`), monta o draft (`POST /draft`) e simula uma temporada de 38 rodadas (`POST /game/:id/play` → `GameService.playSeason`). A simulação já devolve `schedule`, `matches`, `leagueTable`, o destaque e os agregados `pts/v/e/d/gf/gc`; o `Ranking` (`POST /ranking`) registra rank + jogador destaque por game. Eras e clubes vêm de `GET /eras` e `GET /teams`.

**Problema de produto:** o jogo é hoje uma **sessão única** — não há motivo recorrente para voltar, nem comparação social, nem artefato para compartilhar. Faltam os dois motores de crescimento: **retenção** (conteúdo recorrente) e **viralização** (compartilhamento).

---

## 2. Objetivo
Criar **Desafios Semanais** (cenários rotativos com restrições temáticas e um **ranking global** por desafio) e o **Cartão de Temporada** (resumo estruturado e compartilhável do resultado). Conteúdo novo recorrente surge de **combinações de restrições** sobre os mesmos dados — sem produção manual — e o cartão transforma cada campanha em algo "postável".

**Não-objetivo:** autenticação/contas (usaremos o `player_uuid` já existente como identificador, ciente da limitação); geração de imagem no backend (o cartão é um payload estruturado para o frontend renderizar); apostas/monetização.

---

## 3. Hipótese de valor
> **Acreditamos que** oferecer um desafio temático novo por semana com ranking global e um cartão compartilhável **para** jogadores que hoje jogam uma vez e saem **vai resultar em** maior retenção (retorno semanal) e aquisição (compartilhamento).
> **Saberemos que é verdade quando** observarmos retorno recorrente de jogadores aos desafios, crescimento de simulações vinculadas a desafios e tráfego de entrada vindo de cartões compartilhados.

---

## 4. Métricas de sucesso
**Primárias**
- **Retenção:** % de jogadores que retornam para um novo desafio na semana seguinte (retenção D7/semana).
- **Participação:** nº de campanhas submetidas por desafio ativo.
- **Viralização:** nº de cartões gerados e (quando o front instrumentar) cliques de entrada via cartão.

**Guarda-corpo (não pioram)**
- **Integridade do ranking:** sem submissões inválidas (elenco que viola as restrições do desafio) entrando no leaderboard.
- **Performance:** leaderboard com paginação; consultas indexadas (`challenge_id`, ordenação por pontos/saldo).
- **Estabilidade:** `playSeason` continua funcionando para games **sem** desafio (retrocompatível).

---

## 5. Modelo de design (especificação funcional)

### 5.1 Desafio (Challenge)
Entidade com:
- `id`, `name`, `description`.
- **Restrições** (todas opcionais; ausência = sem restrição):
  - `allowed_eras` (lista de eras permitidas), `allowed_teams` (clubes permitidos),
  - `max_overall` (overall máximo por jogador), `single_club` (boolean — todos do mesmo clube),
  - `budget_override` (teto de orçamento específico do desafio; integra com o Épico "Orçamento de Draft" se presente).
- **Janela de atividade:** `starts_at`, `ends_at`.
- Um desafio é "ativo" quando `starts_at ≤ agora ≤ ends_at`.

### 5.2 Vínculo game ↔ desafio
- Um game pode (opcionalmente) referenciar um `challenge_id`. Games sem desafio continuam funcionando como hoje (modo livre).
- Ao montar/simular um game vinculado a um desafio, o elenco é **validado contra as restrições**; violação → rejeição com mensagem clara.

### 5.3 Ranking global por desafio
- Ao concluir a temporada de um game vinculado, o resultado entra no leaderboard do desafio: `pts`, saldo de gols (`gf - gc`), `gf`, e identificador do jogador (`player_uuid`).
- Ordenação: `pts` desc, saldo desc, `gf` desc (mesma regra já usada em `simulateLeagueTable`).
- Leaderboard exposto com paginação.

### 5.4 Cartão de Temporada (payload compartilhável)
- Endpoint que, dado um game concluído, retorna um **DTO de cartão**: nome/era do time do usuário (ou apelido), campanha (`pts/v/e/d/gf/gc`), posição estimada na `leagueTable`, jogador destaque, artilheiro, e — se vinculado — nome do desafio e posição no ranking global.
- Backend devolve **dados**; renderização visual/imagem é responsabilidade do frontend (geração de imagem server-side fica como evolução futura).

---

## 6. Escopo
**Dentro:** modelo e CRUD-leitura de desafios (listar ativos); vínculo opcional game↔desafio + validação de restrições; ranking global por desafio (persistência do resultado + leitura paginada); DTO do cartão de temporada.
**Fora:** autenticação real; geração de imagem do cartão no backend; administração de desafios via UI (criação pode ser via seed/admin script na v1); anti-cheat avançado; notificações.

---

## 7. Sequenciamento e dependências
1. **DES-1** (schema + listar desafios ativos) → base de dados.
2. **DES-2** (vínculo game↔desafio + validação de restrições) depende de DES-1.
3. **DES-3** (ranking global) depende de DES-1 e DES-2 (precisa de games válidos vinculados).
4. **DES-4** (cartão) depende dos dados de campanha; pode usar resultado persistido (DES-3) e independe das restrições.
- **Dependência externa:** validação de `budget_override` reusa o Épico "Orçamento de Draft" (`src/budget/budget.ts`) se já existir; caso não, ignorar `budget_override` e registrar como pendência.
- **Dependência de dados:** RISK-001 (migration da coluna `trait`) deve estar aplicada no ambiente; novas migrations deste épico seguem o mesmo fluxo (`prisma migrate`).

---

## 8. Histórias (especificações para agentes Claude)

> **Convenções para todas as histórias:**
> - Sem infra de testes (sem Jest/eslint). Verificação obrigatória: `npx tsc --noEmit` (exit 0) e `npm run build` (verde). Não instale Jest/eslint.
> - Stack: NestJS 10, Prisma 7 com **driver adapter** (`datasource db` no `schema.prisma` não tem `url`; runtime usa `DATABASE_URL`, CLI/migrations usam `DIRECT_URL` via `prisma.config.ts`). Times são globais (sem era); a combinação time+era vem de `Player.team_id`+`era_id`.
> - **Migrations:** ao alterar `schema.prisma`, gere a migration correspondente em `prisma/migrations/` (mantendo o padrão de nomenclatura `AAAAMMDDHHMMSS_descricao`) e garanta paridade schema↔migrations. Não use só `db push`.
> - Controllers só delegam ao service; acesso a dados só via `PrismaService` injetado. DTOs com `class-validator`. Não ative `strict` no tsconfig.
> - Uma branch por história, commits atômicos. Marque a história como ✅ neste arquivo ao concluir.

---

### DES-1 — Modelo de Desafio + listar desafios ativos

**Contexto:** precisamos persistir desafios e listar os ativos para o jogador escolher. Base do épico (`epics/EPIC-desafios-semanais.md`, seção 5.1).

**Objetivo:** criar a entidade `Challenge`, a migration, e um módulo Nest com leitura dos desafios ativos.

**Arquivos/locais:**
- `prisma/schema.prisma` (novo model `Challenge`, com `@@map("challenges")`).
- Nova migration em `prisma/migrations/`.
- Novo módulo `src/challenge/` (`challenge.module.ts`, `challenge.service.ts`, `challenge.controller.ts`), registrado em `src/app.module.ts`.

**Especificação:**
- Model `Challenge`: `id String @id @default(uuid())`, `name String`, `description String`, `allowed_eras String[]`, `allowed_teams String[]`, `max_overall Int?`, `single_club Boolean @default(false)`, `budget_override Int?`, `starts_at DateTime`, `ends_at DateTime`. Mapear para `challenges`.
- `ChallengeService.findActive()` → desafios com `starts_at <= now() <= ends_at`, ordenados por `ends_at asc`.
- `GET /challenges` → lista ativos. (Opcional `GET /challenges/:id`.)
- Sem endpoint de criação na v1 (desafios criados por seed/admin); se necessário para teste, documentar como criar via `prisma studio`/seed — não expor POST público sem proteção.

**Critérios de aceite:**
- Migration cria a tabela `challenges`; `npx prisma validate` OK; paridade schema↔migrations.
- `GET /challenges` retorna apenas desafios dentro da janela ativa.
- `npm run build` verde.

**Verificação:** `npx prisma validate` + `npx tsc --noEmit` (0) + `npm run build`. (Sem banco, não rodar `migrate dev`; criar a migration manualmente no padrão e validar.)

**Restrições / fora de escopo:** sem CRUD de escrita público; não tocar em `game`/`draft` ainda; sem ranking.

---

### DES-2 — Vincular game a um desafio e validar restrições

**Contexto:** com desafios existindo (DES-1), um game pode referenciar um desafio e o elenco deve respeitar suas restrições (seção 5.2). Games sem desafio seguem como hoje (modo livre).

**Objetivo:** permitir associar `challenge_id` a um game e validar o elenco contra as restrições do desafio no momento de salvar o draft.

**Arquivos/locais:**
- `prisma/schema.prisma` (`Game.challenge_id String?` + relação opcional para `Challenge`) + migration.
- `src/game/dto/create-game.dto.ts` (campo opcional `challenge_id`).
- `src/draft/draft.service.ts` (validação na criação do draft).
- Lógica de validação de restrições isolada (ex.: `src/challenge/challenge-rules.ts`, função pura `validateSquadAgainstChallenge(squad, challenge): { ok: boolean; violations: string[] }`).

**Especificação:**
- `Game.challenge_id` opcional; `CreateGameDto.challenge_id?` validado como `@IsUUID @IsOptional`.
- Na criação do draft, se o game tiver `challenge_id`: carregar o desafio e os jogadores do elenco (com `overall`, `team_id`, `era_id`), e validar:
  - `allowed_eras`/`allowed_teams`: todo jogador deve pertencer às listas (quando a lista não for vazia).
  - `max_overall`: nenhum jogador acima do limite.
  - `single_club`: todos do mesmo `team_id`.
  - `budget_override`: se presente **e** o módulo `src/budget/budget.ts` existir (Épico Orçamento), validar custo ≤ `budget_override`; senão, ignorar e registrar pendência no PR.
- Violações → `BadRequestException` com a lista do que falhou. Game sem `challenge_id` → nenhuma validação nova (comportamento atual preservado).
- A função de validação de restrições deve ser **pura** (sem Prisma), recebendo dados já carregados — para ficar testável e reaproveitável.

**Critérios de aceite:**
- Game vinculado com elenco que viola restrição → 400 listando as violações; nada persistido.
- Game vinculado com elenco válido → persiste normalmente.
- Game **sem** `challenge_id` → fluxo idêntico ao atual (sem regressão).
- Migration com paridade; `tsc`+`build` verdes.

**Verificação:** `npx prisma validate` + `npx tsc --noEmit` (0) + `npm run build`. Com banco: criar desafio restrito (ex.: só anos 90), tentar elenco fora da regra (400) e dentro (ok).

**Restrições / fora de escopo:** não alterar a simulação (`playSeason`) ainda; não criar ranking aqui; não mexer no orçamento além de reusar o módulo existente.

---

### DES-3 — Ranking global por desafio

**Contexto:** resultados de temporadas de games vinculados a um desafio devem alimentar um leaderboard global (seção 5.3).

**Objetivo:** persistir o resultado da campanha ao concluir a simulação de um game vinculado e expor o ranking paginado por desafio.

**Arquivos/locais:**
- `prisma/schema.prisma` (`ChallengeResult`: `id`, `challenge_id`, `game_id @unique`, `player_uuid`, `pts`, `saldo`, `gf`, `created_at`; índices em `challenge_id` e ordenação) + migration.
- `src/game/game.service.ts` (`playSeason`: ao final, se o game tiver `challenge_id`, gravar/atualizar o `ChallengeResult`).
- `src/challenge/` (método + endpoint de leitura do ranking paginado).

**Especificação:**
- Em `playSeason`, após calcular `stats` (já existe), se o game tem `challenge_id`: upsert de `ChallengeResult` (por `game_id` único) com `pts`, `saldo = gf - gc`, `gf`, `player_uuid` (do game). Manter dentro de transação com o `game.update` existente, se viável, sem alterar os campos já atualizados.
- Endpoint `GET /challenges/:id/leaderboard?skip=&take=` → resultados ordenados por `pts desc, saldo desc, gf desc`, paginado (limitar `take`, ex.: máx. 50). Incluir `player_uuid`, `pts`, `saldo`, `gf`, `created_at`.
- Games sem `challenge_id` → nenhuma escrita em `ChallengeResult` (comportamento atual de `playSeason` preservado, incluindo o shape de resposta).

**Critérios de aceite:**
- Concluir temporada de game vinculado cria/atualiza uma linha em `challenge_results`; re-simular o mesmo game atualiza (não duplica — `game_id` único).
- `GET /challenges/:id/leaderboard` retorna ordenado e paginado.
- `playSeason` de game sem desafio inalterado.
- Migration com paridade; `tsc`+`build` verdes.

**Verificação:** `npx prisma validate` + `npx tsc --noEmit` (0) + `npm run build`. Com banco: simular 2 games no mesmo desafio e conferir ordenação no leaderboard.

**Restrições / fora de escopo:** sem anti-cheat; o shape de resposta de `playSeason` não muda (apenas efeito colateral de persistência); paginação obrigatória (não retornar lista ilimitada).

---

### DES-4 — Cartão de Temporada (payload compartilhável)

**Contexto:** transformar o resultado de uma temporada num resumo estruturado pronto para o frontend renderizar/compartilhar (seção 5.4).

**Objetivo:** endpoint que retorna o DTO do cartão de um game concluído.

**Arquivos/locais:** `src/game/game.controller.ts` e `src/game/game.service.ts` (novo método de leitura). Reusar dados já persistidos no `Game` (`pts/v/e/d/gf/gc`, `ranking`) e no `Ranking`/`ChallengeResult` quando existirem.

**Especificação:**
- `GET /game/:id/card` → DTO: `{ campaign: { pts, v, e, d, gf, gc }, rank, destaque: { name, overall } | null, challenge: { id, name, position } | null }`.
  - `destaque`: do `Ranking` do game, se existir (`destaque_player`).
  - `challenge.position`: se o game for vinculado e houver `ChallengeResult`, calcular a posição no leaderboard (count de resultados melhores + 1); senão `null`.
- Game inexistente → 404 (reusar o padrão de `NotFoundException` já usado em `findOne`).
- Não recalcular a temporada — apenas ler o que está salvo.

**Critérios de aceite:**
- `GET /game/:id/card` devolve o DTO com campanha, rank e destaque quando disponíveis.
- Game vinculado a desafio com resultado → `challenge.position` coerente com o leaderboard (DES-3).
- Game livre (sem desafio) → `challenge: null`, demais campos preenchidos.
- `tsc`+`build` verdes.

**Verificação:** `npx tsc --noEmit` (0) + `npm run build`. Com banco: concluir um game e conferir o cartão; comparar `challenge.position` com `GET /challenges/:id/leaderboard`.

**Restrições / fora de escopo:** **não** gerar imagem no backend (só dados); não persistir o cartão; não alterar `playSeason`.

---

## 9. Riscos e mitigações
- **Submissões inválidas no ranking:** validação de restrições em DES-2 barra elenco fora da regra antes de gerar resultado.
- **Identidade fraca (`player_uuid` não autenticado):** aceitável na v1; leaderboard pode ter duplicidade por usuário — registrar como limitação e tratar com autenticação futura.
- **Crescimento do leaderboard / performance:** índices em `challenge_id` e paginação obrigatória.
- **Acoplamento com Orçamento de Draft:** `budget_override` só é validado se o módulo de orçamento existir; caso contrário, ignorar e documentar.
- **Migrations e driver adapter:** seguir o fluxo de migration do projeto e garantir `DIRECT_URL` no ambiente (ver RISK-002).

## 10. Definição de pronto (épico)
- DES-1..4 entregues, com migrations em paridade e `tsc`+`build` verdes.
- `GET /challenges` lista ativos; games vinculados validam restrições; leaderboard paginado funciona; cartão retorna dados do game.
- Games sem desafio permanecem 100% retrocompatíveis.
- Este documento atualizado com as histórias concluídas.
