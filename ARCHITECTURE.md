# Arquitetura do Projeto — RTT BR API

## Stack
- **Framework**: NestJS 10 (`@nestjs/platform-express`).
- **ORM**: Prisma (`@prisma/client`) com **driver adapter** `@prisma/adapter-pg` (pool `pg`).
- **Banco**: PostgreSQL (Supabase — pooling via `DATABASE_URL`, conexão direta para migrations via `DIRECT_URL`).
- **Config**: `@nestjs/config` (`ConfigModule.forRoot({ isGlobal: true })`).
- **Validação**: `class-validator` + `class-transformer` via `ValidationPipe` global.
- **Deploy**: Railway via `Dockerfile` (node:22-alpine), porta 8080 exposta.

## Diagrama de Módulos
```
AppModule
├── ConfigModule (global)
├── PrismaModule (global)  ──exporta──> PrismaService  (injetado por todos abaixo)
├── EraModule        → PrismaService
├── TeamModule       → PrismaService
├── PlayerModule     → PrismaService
├── GameModule       → PrismaService   (lógica de simulação)
├── MatchModule      → PrismaService
├── DraftModule      → PrismaService
├── RankingModule    → PrismaService
└── TeamStatsModule  → PrismaService
```
Não há dependências entre módulos de feature (sem `forwardRef`, sem ciclos). O único acoplamento é via `PrismaService` global.

## Modelo de Dados (Prisma)
```
Era 1───* Player *───1 Team
Game 1───* Draft *───1 Player
Game 1───* Match
Game 1───1 Ranking *───1 Player (destaque)
TeamEraStat  (tabela derivada: team+era → atk_ovr, def_ovr; unique(team,era))
```
- `Team` é **global** (sem `era_id`; `name` é unique). A combinação time+era vem de `Player.team_id` + `Player.era_id`.
- Cascades `onDelete: Cascade` em `drafts`, `matches`, `rankings` a partir de `games`.
- `players.trait` é opcional e existe só no schema (ver RISKS.md RISK-001).

## Pipeline de Requisição
```
Express → CORS (origin = FRONTEND_URL) → ValidationPipe global (whitelist+transform) → Controller → Service → PrismaService → PostgreSQL
```
- **Sem** middleware customizado, **sem** Guards, **sem** Interceptors, **sem** ExceptionFilter customizado.
- Erros: apenas `NotFoundException`/`BadRequestException` lançados manualmente nos services; o resto cai no exception filter padrão do Nest.

## Mapa de Endpoints
| Método | Rota | Service |
|--------|------|---------|
| GET  | `/eras` | EraService.findAll |
| GET  | `/teams` | TeamService.findAll |
| GET  | `/players?eraId=&teamId=` | PlayerService.findAll |
| POST | `/game` | GameService.create |
| GET  | `/game/player/:uuid` | GameService.findByPlayer |
| GET  | `/game/:id` | GameService.findOne |
| PATCH| `/game/:id` | GameService.update |
| POST | `/game/:id/play` | GameService.playSeason |
| POST | `/draft` | DraftService.create (createMany) |
| GET  | `/draft/:gameId` | DraftService.findByGame |
| POST | `/match` | MatchService.create |
| GET  | `/match/game/:gameId` | MatchService.findByGame |
| POST | `/ranking` | RankingService.create (transação) |
| GET  | `/ranking/player/:uuid` | RankingService.findByPlayer |
| GET  | `/team-stats` | TeamStatsService.findAll |
| POST | `/team-stats/refresh` | TeamStatsService.refresh (transação delete+create) |

## Fluxo de Autenticação
**Não existe.** Não há JWT, Passport, Guards nem `@CurrentUser`. A "identidade" do jogador é apenas um `player_uuid` (string livre) enviado no body/param — não autenticado. Todos os endpoints são públicos.

## Fluxo de Simulação (`POST /game/:id/play`) — núcleo do produto
1. Carrega o `game` (404 se não existir).
2. `buildSchedule()` → `buildOpponentPool()` lê `team_era_stats` (exige ≥2 linhas), embaralha, monta 1º turno (até `POOL_SIZE = 19` adversários) e returno (mando invertido). Gera calendário com mando de campo.
3. Carrega o draft do game (`myPlayers` usando `slot_pos`, a posição em campo).
4. Carrega em **batch único** todos os jogadores dos adversários (um `findMany` com `in`), agrupados por `time|||era`.
5. Para cada jogo: `runSimulation()` usa gols por **distribuição de Poisson** com λ proporcional a `atk/def` e bônus de mando (`HOME_BOOST = 1.08`); `pickScorers()` sorteia artilheiros por pesos de posição.
6. Agrega `pts/v/e/d/gf/gc` e atualiza o `game`.
7. `simulateLeagueTable()` simula 36 jogos extras por adversário para estimar a tabela.
8. Retorna `{ schedule, matches, leagueTable, ...stats }`. **`matches` não é persistido aqui.**

## Decisões de Arquitetura Observadas
- Arquitetura modular padrão NestJS, um recurso por módulo, com `PrismaModule` global — escolha deliberada e idiomática.
- Uso de **driver adapter** do Prisma (`adapter-pg`) em vez de `datasource.url` no schema — alinhado ao pooling do Supabase (pgbouncer).
- `team_era_stats` é uma **tabela materializada/derivada** recalculada sob demanda (`/team-stats/refresh`), provavelmente para evitar recomputar médias de overall a cada simulação. [INFERÊNCIA] É uma decisão de performance.
- Consulta em batch dos jogadores adversários (linhas 78-92 de `game.service.ts`) mostra preocupação consciente em evitar N+1. [INFERÊNCIA]
- Normalização de posições no seed (`MEIA/ME/MD → MEI`) sugere que os dados-fonte (planilha Excel) usavam nomenclatura longa e o domínio do app padronizou para códigos curtos. [INFERÊNCIA]
- Ausência total de auth/observabilidade/testes indica projeto em estágio inicial/MVP ou hobby. [INFERÊNCIA]

## Pontos Bem Implementados (laudo honesto)
- `ValidationPipe` global com `whitelist` + `transform` corretamente configurado.
- Controllers enxutos, sem lógica de negócio nem acesso direto ao repositório.
- CORS restrito a uma origem (`FRONTEND_URL`), não wildcard.
- Uso de transações (`$transaction`) onde há escritas correlacionadas (ranking, team-stats).
- Cascades de exclusão bem definidos no schema.
- Batch query para evitar N+1 na simulação.
