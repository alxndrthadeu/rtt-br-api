# RTT BR API (Brasileirão Histórico) — Contexto para Claude Code

## Sistema
API NestJS 10 que alimenta um jogo de "fantasy" do Brasileirão histórico: o usuário monta um elenco (draft) com craques de eras passadas (80s, 90s, 00s, 10s, 20s) e simula uma temporada de 38 rodadas contra times reais. Persistência em PostgreSQL (Supabase) via Prisma usando **driver adapter** (`@prisma/adapter-pg`).

## Estrutura de Módulos
- **PrismaModule** (`@Global`) — expõe `PrismaService` (estende `PrismaClient`). Todos os módulos injetam daqui; não recrie.
- **EraModule** — `GET /eras` (lista eras).
- **TeamModule** — `GET /teams` (lista times; times são globais, sem era).
- **PlayerModule** — `GET /players?eraId=&teamId=` (lista jogadores).
- **GameModule** — CRUD de partida + `POST /game/:id/play` (gera calendário, simula 38 jogos, tabela e artilheiros). Contém toda a lógica de simulação.
- **DraftModule** — `POST /draft` (salva elenco), `GET /draft/:gameId`.
- **MatchModule** — `POST /match`, `GET /match/game/:gameId`.
- **RankingModule** — `POST /ranking` (cria ranking + atualiza game em transação), `GET /ranking/player/:uuid`.
- **TeamStatsModule** — `GET /team-stats`, `POST /team-stats/refresh` (recalcula atk/def overall por time-era).

## Convenções Obrigatórias
- DTOs sempre com `class-validator`; `ValidationPipe` global usa `whitelist: true` + `transform: true` (campos não declarados no DTO são removidos do body — declare tudo que precisa receber).
- Controllers só delegam ao service; nenhuma lógica de negócio nem acesso ao Prisma em controller. Mantenha esse padrão.
- Acesso ao banco somente via `PrismaService` injetado. Nunca instanciar `PrismaClient`/serviço com `new`.
- **Posições são normalizadas para os códigos curtos**: `MEIA`/`ME`/`MD` → `MEI`. O banco deve conter apenas `GK, ZAG, LD, LE, MEI, PD, PE, CA`. A lógica de jogo depende disso (ver Armadilhas).

## Invariantes — Não Quebre Isso
- O código de simulação compara posição contra os literais `MEI/CA/PE/PD/LD/LE/ZAG/GK` em `src/game/game.service.ts` (`SCORER_WEIGHTS`) e `src/team-stats/team-stats.service.ts` (`ATTACK_ROLES`/`DEFENSE_ROLES`). Se inserir jogadores com `MEIA`/`ME`/`MD` crus, eles somem dos cálculos silenciosamente. Sempre normalize antes de inserir.
- `POST /game/:id/play` exige que `team_era_stats` esteja populada (mín. 2 linhas) e que o draft do game já exista. Rode `POST /team-stats/refresh` após semear o banco.
- `Ranking.game_id` é único (1 ranking por game). `POST /ranking` repetido para o mesmo game viola a constraint.
- Deletar um `Game` faz cascade em `drafts`, `matches` e `ranking` (definido no schema). Não há cascade de `players`.

## Armadilhas Conhecidas
- **`seed.ts` é o seed canônico** (`npm run db:seed` → `tsx prisma/seed.ts`); ele normaliza posições e TRUNCA `players/teams/eras`. **`prisma/seed.sql` está DESATUALIZADO** e incompatível com o schema atual (insere `teams.era_id`, coluna que foi removida; usa posições cruas `MEIA/ME/MD`; UUIDs diferentes). Não use o `.sql`.
- **A coluna `players.trait` existe no `schema.prisma` mas NÃO tem migration.** Banco criado só via `prisma migrate deploy` não terá a coluna e as queries de Player do Prisma vão falhar. Use `npm run db:push` ou crie a migration faltante (ver RISKS.md RISK-001).
- O `Dockerfile` (deploy Railway) **não roda `prisma migrate deploy`** — só `prisma generate` + `nest build`. Aplicar schema é manual.
- `POST /game/:id/play` retorna `matches`, `leagueTable` e artilheiros, mas **não persiste** as linhas de `matches` (só atualiza os agregados no `games`). Quem grava `matches` é o `POST /match` separado.
- `schema.prisma` usa driver adapter: o bloco `datasource db` não tem `url`. Runtime lê `DATABASE_URL` no `PrismaService`; CLI/migrations leem `DIRECT_URL` via `prisma.config.ts`.

## Comandos Essenciais
- Rodar dev: `npm run start:dev`
- Build: `npm run build` (= `prisma generate && nest build`)
- Gerar client Prisma: `npm run db:generate`
- Criar migration (dev): `npm run db:migrate`
- Sincronizar schema sem migration: `npm run db:push`
- Semear banco: `npm run db:seed`
- Prisma Studio: `npm run db:studio`
- Lint: `npm run lint`

## Áreas sem Cobertura de Testes
**Não há nenhum teste no projeto** (sem Jest, sem `*.spec.ts`, sem e2e). Cuidado redobrado ao alterar:
- `src/game/game.service.ts` — simulação Poisson, calendário, tabela e artilheiros (núcleo do produto, sem rede de segurança).
- `src/team-stats/team-stats.service.ts` — delete+recreate em transação.
- `src/ranking/ranking.service.ts` — transação ranking + update de game.
