# FIX_PLAN.md — Plano de Correção dos Achados (RISKS.md)

Plano para agentes de codificação. **Regras invioláveis:**
- Corrigir **apenas** os achados listados em `RISKS.md`. Nada além disso.
- **Não** adicionar funcionalidades novas. **Não** alterar comportamento existente além do estritamente necessário para corrigir o bug descrito.
- Sem over-engineering, sem abstrações especulativas, sem refatorações amplas.
- Cada tarefa traz o arquivo, a mudança mínima e como verificar. Se a verificação não passar, parar e reportar — não improvisar.
- Itens marcados **[REQUER DECISÃO]** não devem ser implementados automaticamente; apenas reportar ao humano.

Ordem de execução: FASE 1 → FASE 2 → FASE 3. As fases são independentes entre si, mas dentro de cada fase siga a ordem.

---

## FASE 1 — Crítico (schema/deploy). Fazer antes de qualquer outra coisa.

### TASK-001 — Gerar a migration faltante da coluna `players.trait` (RISK-001)
**Arquivos**: `prisma/migrations/` (novo diretório) — `prisma/schema.prisma` já tem `trait String?`, **não alterar o schema**.
**Mudança mínima**:
- Criar uma migration que adicione a coluna, equivalente a:
  `ALTER TABLE "players" ADD COLUMN "trait" TEXT;` (nullable, sem default — bate com `trait String?`).
- Preferir `npx prisma migrate dev --name add_player_trait` (gera o diretório com timestamp e atualiza `_prisma_migrations`). Se não houver banco de dev acessível, criar manualmente `prisma/migrations/<timestamp>_add_player_trait/migration.sql` com o `ALTER TABLE` acima, mantendo o padrão de nomenclatura das migrations existentes.
**Não fazer**: não mexer em outras colunas, não recriar tabelas, não rodar `db push`.
**Verificar**:
- `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --exit-code` retorna 0 (schema e migrations em paridade).
- `npm run build` passa.

### TASK-002 — Aplicar migrations no deploy (RISK-002)
**Arquivo**: `Dockerfile` (e/ou `railway.json`).
**Mudança mínima**:
- Adicionar `prisma migrate deploy` como passo de **release/start**, NÃO dentro do `RUN` de build (build não tem acesso ao banco).
- Opção recomendada (mínima): trocar o `CMD` para aplicar migrations antes de subir:
  `CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]`.
**Pré-condição**: `DIRECT_URL` precisa estar disponível em runtime (é o que `prisma.config.ts` usa para migrations). Confirmar que a env var existe no ambiente Railway; se não, reportar **[REQUER DECISÃO]** em vez de adivinhar.
**Não fazer**: não adicionar `migrate deploy` no `RUN npm run build`; não trocar `generate` por `deploy`.
**Verificar**: `docker build .` conclui; o comando final contém `prisma migrate deploy && node dist/main.js`.

---

## FASE 2 — Integridade de dados.

### TASK-003 — Remover `prisma/seed.sql` desatualizado (RISK-003)
**Arquivo**: `prisma/seed.sql`.
**Mudança mínima**: deletar o arquivo. `prisma/seed.ts` é a fonte de verdade (`package.json` → `db:seed`).
**Não fazer**: não tentar "consertar" o `.sql` regenerando 731 linhas; não alterar `seed.ts`.
**Verificar**: `git status` mostra `deleted: prisma/seed.sql`; `npm run build` passa; nenhuma referência a `seed.sql` em `package.json`/`Dockerfile` (grep para confirmar que não é usado).

### TASK-004 — Corrigir `CreateMatchDto` sem `is_home` (RISK-009)
**Arquivo**: `src/match/dto/create-match.dto.ts`.
**Mudança mínima**: adicionar o campo, alinhado ao schema (`is_home Boolean @default(false)`):
```ts
@IsBoolean()
@IsOptional()
is_home?: boolean;
```
(importar `IsBoolean`, `IsOptional` de `class-validator`).
**Nota de comportamento**: isto passa a permitir persistir `is_home` via `POST /match` (hoje o `whitelist` o descarta e fica sempre `false`). É a correção do bug, não uma feature nova.
**Não fazer**: não mudar o `MatchService`, não tornar o campo obrigatório.
**Verificar**: `npm run build` passa; enviar `POST /match` com `is_home: true` persiste `true`.

### TASK-005 — Centralizar os códigos de posição (RISK-004, parte segura)
**Arquivos**: novo `src/common/positions.ts`; `src/game/game.service.ts`; `src/team-stats/team-stats.service.ts`.
**Mudança mínima (preserva 100% do comportamento)**:
- Criar `src/common/positions.ts` exportando os códigos canônicos já usados hoje:
  `export const POSITIONS = ['GK','ZAG','LD','LE','MEI','PD','PE','CA'] as const;`
- Substituir as listas/sets duplicados em `team-stats.service.ts` (`ATTACK_ROLES`, `DEFENSE_ROLES`) e `game.service.ts` (`SCORER_WEIGHTS`) para **referenciarem** o conjunto canônico onde fizer sentido, **sem alterar nenhum valor** (mesmos pesos, mesmos membros de cada set).
**Não fazer**: NÃO mudar pesos de `SCORER_WEIGHTS`, NÃO mudar quais posições entram em ATK/DEF, NÃO mexer no `normalizePos` do `seed.ts`. Esta tarefa é só extração de constante para evitar drift futuro.
**Verificar**: `npm run build` passa; revisar diff para confirmar que nenhum valor numérico/membro de set mudou.

> **[REQUER DECISÃO] — RISK-004 (validação de borda)**: adicionar `@IsIn(POSITIONS)` em `slot_pos`/`pos_*` rejeitaria entradas não normalizadas que hoje são aceitas (mudança de comportamento na borda). Não implementar sem confirmação do responsável.

---

## FASE 3 — Robustez (correções de baixo risco).

### TASK-006 — ExceptionFilter para erros do Prisma (RISK-006)
**Arquivos**: novo `src/common/filters/prisma-exception.filter.ts`; registrar em `src/main.ts`.
**Mudança mínima**:
- Filtro que captura `Prisma.PrismaClientKnownRequestError` e mapeia o mínimo necessário:
  - `P2002` → `409 Conflict`
  - `P2025` → `404 Not Found`
  - demais → `500` com mensagem genérica (sem repassar `error.message` cru do Prisma).
- Registrar via `app.useGlobalFilters(new PrismaExceptionFilter())` em `main.ts`.
**Não fazer**: não criar hierarquia de exceções customizadas, não mapear dezenas de códigos — apenas os dois acima + fallback. Manter as `NotFoundException`/`BadRequestException` existentes.
**Verificar**: `npm run build` passa; `POST /ranking` duplicado para o mesmo `game_id` retorna 409 (não 500 com texto do Prisma).

### TASK-007 — Shutdown limpo do Prisma (RISK-008)
**Arquivo**: `src/prisma/prisma.service.ts`.
**Mudança mínima**: implementar `OnModuleDestroy`:
```ts
async onModuleDestroy() {
  await this.$disconnect();
}
```
(adicionar `OnModuleDestroy` ao `implements` e ao import de `@nestjs/common`).
**Não fazer**: não adicionar `enableShutdownHooks` global nem lógica extra de sinais.
**Verificar**: `npm run build` passa.

### TASK-008 — Adicionar `helmet` (RISK-007, parte segura)
**Arquivos**: `package.json` (dep `helmet`); `src/main.ts`.
**Mudança mínima**: `npm i helmet`; em `main.ts`, `app.use(helmet())` antes do `listen`.
**Não fazer**: não configurar CSP customizada nem opções avançadas (default basta).
**Verificar**: `npm run build` passa; resposta HTTP traz headers do helmet (ex.: `x-content-type-options`).

### TASK-009 — Embaralhamento uniforme em `buildSchedule` (RISK-011)
**Arquivo**: `src/game/game.service.ts` (linhas ~179-180).
**Mudança mínima**: substituir `sort(() => Math.random() - 0.5)` por Fisher–Yates aplicado às cópias de array já existentes (`firstTurn`, `secondTurn`). Manter a mesma estrutura/saída (lista embaralhada).
**Não fazer**: não alterar `POOL_SIZE`, lógica de mando, ou o restante de `buildSchedule`.
**Verificar**: `npm run build` passa; `POST /game/:id/play` segue retornando `schedule` com a mesma forma.

---

## NÃO IMPLEMENTAR AUTOMATICAMENTE — [REQUER DECISÃO]

- **RISK-005 (matches/leagueTable não persistidos)**: persistir `matches`/artilheiros mudaria comportamento e talvez o modelo de dados. Decisão de produto. Apenas reportar.
- **RISK-007 (auth / rate-limit / proteção do `team-stats/refresh`)**: autenticação é funcionalidade nova; throttler adiciona módulo/dep e altera comportamento. Decisão do responsável. (Apenas `helmet` foi incluído acima por ser inócuo.)
- **RISK-010 (`tsconfig` strict / validação de env)**: ligar `strict` pode quebrar o build em vários pontos (mudança ampla). Avaliar custo antes; não fazer dentro deste plano de correções pontuais.

---

## Checklist final (rodar após cada fase)
1. `npm run build` — verde.
2. `npm run lint` — sem erros novos.
3. `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --exit-code` — retorna 0.
4. Revisar o `git diff` e confirmar que **nenhuma** mudança extrapola o escopo da tarefa correspondente.
