# RISKS.md — RTT BR API

Achados da análise estática (FASE 3). Fatos = "o que o código faz"; opiniões marcadas como [INFERÊNCIA].

---
### RISK-001 — Coluna `players.trait` no schema sem migration correspondente

**Categoria**: Dados / Configuração
**Severidade**: CRÍTICO
**Status**: [CONFIRMADO]
**Localização**: `prisma/schema.prisma` linha 38 (`trait String?`) vs. `prisma/migrations/*` (nenhuma adiciona `trait`)

**Evidência**:
O modelo `Player` declara `trait String?`. Nenhum dos 5 arquivos em `prisma/migrations/` menciona `trait` (grep retornou vazio). Há commits "add trait column to players" e "novos traits", mas o histórico de migrations não foi atualizado — provavelmente aplicado via `prisma db push`.

**Impacto**:
Um banco provisionado apenas com `prisma migrate deploy` (ex.: ambiente novo / CI / produção) **não terá a coluna `trait`**. Como o Prisma Client é gerado a partir do schema e seleciona todas as colunas escalares, qualquer query de `Player` (ex.: `GET /players`, `playSeason`) falha com `column players.trait does not exist`.

**Recomendação**:
Gerar a migration faltante (`prisma migrate dev --name add_player_trait`) e versioná-la. Garantir paridade entre `schema.prisma` e `migrations/` antes de qualquer deploy.

---
### RISK-002 — Deploy não aplica migrations (Dockerfile sem `migrate deploy`)

**Categoria**: Configuração / Dados
**Severidade**: ALTO
**Status**: [CONFIRMADO]
**Localização**: `Dockerfile` (RUN `npm ci && npm run build`; CMD `node dist/main.js`)

**Evidência**:
O build roda `prisma generate && nest build` e o start roda `node dist/main.js`. Não há passo de `prisma migrate deploy` no build, no start, nem no `railway.json`.

**Impacto**:
Alterações de schema não são aplicadas automaticamente no deploy. O banco de produção pode ficar defasado em relação ao client gerado, causando erros de coluna/tabela inexistente em runtime (relacionado ao RISK-001).

**Recomendação**:
Adicionar `prisma migrate deploy` num passo de release (entrypoint ou comando de deploy do Railway), separado do `prisma generate`. Não aplicar migrations dentro do `RUN` do build (sem acesso ao banco de produção).

---
### RISK-003 — `prisma/seed.sql` desatualizado e incompatível com o schema atual

**Categoria**: Manutenção / Dados
**Severidade**: ALTO
**Status**: [CONFIRMADO]
**Localização**: `prisma/seed.sql` (731 linhas)

**Evidência**:
- Insere `teams (id, name, icon, era_id)` com `ON CONFLICT (name, era_id)` — mas a migration `20260606060000_remove_era_from_teams` removeu `teams.era_id` e a constraint `teams_name_era_id_key`, trocando por unique só em `name`.
- Usa posições cruas: 237×`MEIA`, 22×`ME`, 22×`MD` (não normalizadas para `MEI`).
- UUIDs de eras/teams diferentes dos usados em `prisma/seed.ts`.

**Impacto**:
Executar `seed.sql` contra o banco atual falha (coluna/constraint inexistentes). Caso forçado, popularia posições incompatíveis com a lógica de jogo (ver RISK-004). Artefato órfão que induz erro de quem for semear o banco manualmente.

**Recomendação**:
Remover `prisma/seed.sql` ou regenerá-lo a partir do `seed.ts` (única fonte de verdade, referenciada em `package.json` → `db:seed`).

---
### RISK-004 — Lógica de jogo acoplada a literais de posição normalizados (`MEI`)

**Categoria**: Dados / Manutenção
**Severidade**: ALTO
**Status**: [CONFIRMADO]
**Localização**: `src/game/game.service.ts` linhas 11-13 (`SCORER_WEIGHTS`); `src/team-stats/team-stats.service.ts` linhas 4-5 (`ATTACK_ROLES`/`DEFENSE_ROLES`)

**Evidência**:
O código compara `pos_principal`/`slot_pos` contra `MEI/CA/PE/PD/LD/LE/ZAG/GK`. A correção depende inteiramente da normalização em `seed.ts` (`normalizePos`: `MEIA/ME/MD → MEI`). Não há validação/enum no banco nem nos DTOs que garanta esses valores. Os dados-fonte usam `MEIA/ME/MD` (207/4/6 ocorrências em `seed.ts`).

**Impacto**:
Qualquer jogador inserido sem normalização (via `seed.sql`, import externo ou ajuste manual) é **silenciosamente ignorado**:
- Em `team-stats.refresh`: `MEIA/ME/MD` não pertencem a `ATTACK_ROLES` nem `DEFENSE_ROLES` → meio-campistas (frequentemente os de maior overall, ex. Zico 99, Sócrates 96) não entram em nenhuma média → `atk_ovr`/`def_ovr` distorcidos.
- Em `pickScorers`: posição sem peso é filtrada → esses jogadores nunca marcam.
Nenhum erro é lançado; o bug é invisível.

**Recomendação**:
Centralizar os códigos de posição num enum/constante compartilhada, validar `pos_principal`/`slot_pos` nos DTOs (`@IsIn([...])`), e normalizar no ponto de entrada de dados em vez de só no seed.

---
### RISK-005 — `playSeason` não persiste `matches` nem `leagueTable`/artilheiros

**Categoria**: Dados
**Severidade**: MÉDIO
**Status**: [CONFIRMADO]
**Localização**: `src/game/game.service.ts` linhas 94-140

**Evidência**:
`playSeason` monta `matchData` (com `my_scorers`/`opp_scorers`) e `leagueTable`, atualiza apenas os agregados em `games` (`pts/v/e/d/gf/gc`) e retorna tudo no response. Não há `prisma.match.createMany`. A persistência de `matches` só ocorre via `POST /match` (chamada separada, e o `CreateMatchDto` nem inclui artilheiros).

**Impacto**:
Calendário detalhado, artilheiros e tabela estimada são efêmeros: ao recarregar, `GET /match/game/:id` pode vir vazio e os artilheiros se perdem. Possível inconsistência entre o que o usuário viu na simulação e o que fica salvo. [INFERÊNCIA] Pode ser intencional (frontend persiste depois), mas é frágil.

**Recomendação**:
Definir explicitamente a fronteira de persistência: ou `playSeason` grava `matches` em transação junto com os agregados, ou documentar que o cliente deve persistir. Se artilheiros importam, modelá-los no schema.

---
### RISK-006 — Erros do Prisma vazam para o cliente (sem ExceptionFilter)

**Categoria**: Segurança / Manutenção
**Severidade**: MÉDIO
**Status**: [CONFIRMADO]
**Localização**: `src/main.ts` (sem `useGlobalFilters`); todos os services

**Evidência**:
Não há ExceptionFilter customizado. Erros não tratados do Prisma (ex.: `P2002` ao repetir `POST /ranking` com `game_id` já existente — `Ranking.game_id` é unique; `P2003` de FK; coluna inexistente do RISK-001) sobem ao filtro padrão.

**Impacto**:
Mensagens internas do Prisma (nomes de colunas, constraints, detalhes de schema) podem ser retornadas ao cliente, além de virarem 500 genéricos para casos que deveriam ser 409/400. Vaza estrutura interna e piora a UX de erro.

**Recomendação**:
Adicionar um `PrismaClientExceptionFilter` (ou filtro global) que mapeie códigos Prisma (`P2002→409`, `P2025→404`, etc.) para respostas padronizadas, sem expor detalhes internos.

---
### RISK-007 — Endpoints de escrita públicos, sem auth/rate-limit/helmet

**Categoria**: Segurança
**Severidade**: MÉDIO
**Status**: [CONFIRMADO]
**Localização**: `src/main.ts`; todos os controllers

**Evidência**:
Não há Guards, JWT, `@nestjs/throttler`, `helmet`, nem limite de tamanho de payload configurado. `player_uuid` é string livre não autenticada. Endpoints como `POST /game`, `POST /draft`, `POST /ranking` e especialmente `POST /team-stats/refresh` (que faz `deleteMany` + `createMany` em toda a tabela) são abertos.

**Impacto**:
Qualquer um pode criar games/drafts/rankings em massa ou disparar `refresh` repetidamente (recomputação custosa + janela de reescrita da tabela). Sem rate limit, é trivial abusar; sem helmet, faltam headers de segurança HTTP.

**Recomendação**:
Adicionar `helmet`, `@nestjs/throttler` (ao menos nos POSTs), limite de body, e proteger `team-stats/refresh` (auth/admin ou token). Avaliar autenticação mínima para escrita.

---
### RISK-008 — `PrismaService` sem shutdown hooks / `$disconnect`

**Categoria**: Configuração
**Severidade**: BAIXO
**Status**: [CONFIRMADO]
**Localização**: `src/prisma/prisma.service.ts`; `src/main.ts`

**Evidência**:
`PrismaService` implementa só `OnModuleInit` (`$connect`). Não há `OnModuleDestroy`/`$disconnect`, e `app.enableShutdownHooks()` não é chamado em `main.ts`.

**Impacto**:
Conexões podem não ser encerradas de forma limpa em shutdown/redeploy. Impacto baixo com pooling do Supabase, mas pode deixar conexões penduradas em restarts frequentes.

**Recomendação**:
Implementar `onModuleDestroy() { await this.$disconnect(); }` e/ou `app.enableShutdownHooks()`.

---
### RISK-009 — `CreateMatchDto` sem `is_home` (sempre `false`)

**Categoria**: Dados
**Severidade**: BAIXO
**Status**: [CONFIRMADO]
**Localização**: `src/match/dto/create-match.dto.ts`; `prisma/schema.prisma` (`Match.is_home`)

**Evidência**:
`Match.is_home` existe (default `false`), mas o DTO não o declara. Com `whitelist: true`, mesmo que o cliente envie `is_home`, ele é removido do body. Logo todo match criado por `POST /match` fica `is_home = false`.

**Impacto**:
Perde-se o contexto de mando ao persistir partidas individualmente; análises por mando ficam incorretas.

**Recomendação**:
Adicionar `@IsBoolean() @IsOptional() is_home?: boolean;` ao DTO.

---
### RISK-010 — Configuração TypeScript permissiva

**Categoria**: Manutenção
**Severidade**: BAIXO
**Status**: [CONFIRMADO]
**Localização**: `tsconfig.json` (`strictNullChecks: false`, `noImplicitAny: false`)

**Evidência**:
Strict mode desligado; uso de `process.env.DATABASE_URL!` (non-null assertion) em `prisma.service.ts` e `seed.ts`.

**Impacto**:
Reduz a detecção de bugs de null/undefined em tempo de compilação. Se `DATABASE_URL` faltar, o erro só aparece em runtime.

**Recomendação**:
Migrar gradualmente para `strict: true`; validar env vars no boot (ex.: schema de config com `@nestjs/config` + validação).

---
### RISK-011 — Embaralhamento enviesado em `buildSchedule`

**Categoria**: Manutenção (correção lúdica)
**Severidade**: BAIXO
**Status**: [CONFIRMADO]
**Localização**: `src/game/game.service.ts` linhas 179-180

**Evidência**:
`pool.sort(() => Math.random() - 0.5)` não produz permutação uniforme (viés conhecido do `sort` com comparador aleatório).

**Impacto**:
Distribuição de adversários levemente enviesada. Apenas estético/lúdico, sem impacto funcional grave.

**Recomendação**:
Usar Fisher–Yates se a aleatoriedade uniforme importar.

---
## Resumo
- **Total de riscos**: 11 (11 confirmados, 0 suspeitas)
- **Críticos**: 1 (RISK-001) | **Altos**: 3 (RISK-002, 003, 004) | **Médios**: 3 (RISK-005, 006, 007) | **Baixos**: 4 (RISK-008, 009, 010, 011)
- **Maior risco imediato**: RISK-001 + RISK-002 — drift entre `schema.prisma` e `migrations/` (coluna `trait`) combinado com deploy que não roda `migrate deploy`. Em um banco novo, a API quebra nas queries de Player. Resolver **antes de qualquer PR/deploy**.
- **Recomendação para próxima sessão**: começar regularizando migrations (gerar a de `trait`, validar paridade schema↔DB) e o pipeline de deploy; em seguida, remover/regenerar `seed.sql` e centralizar/validar os códigos de posição (RISK-003/004), que afetam diretamente a correção da simulação.
