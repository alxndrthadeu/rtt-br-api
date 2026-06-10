# Épico: Química de Elenco

> Documento de produto (PO). As **histórias** ao final são especificações de execução para **agentes de codificação Claude** — escritas para serem autossuficientes (o agente não vê esta conversa).

---

## 1. Contexto do produto (para quem chega agora)
RTT BR API é o backend (NestJS 10 + Prisma/PostgreSQL) de um jogo de fantasy do Brasileirão histórico. O jogador monta um elenco (draft) com craques de eras passadas (80s, 90s, 00s, 10s, 20s) de 12 clubes, define uma formação e simula uma temporada de 38 rodadas. Hoje a simulação (`src/game/game.service.ts`, método `playSeason` → `runSimulation`) usa uma distribuição de Poisson cujo λ depende só de `attack_ovr`/`def_ovr` informados e de um bônus de mando (`HOME_BOOST`). Cada `Player` tem `overall`, `pos_principal`, `estilo`, `trait` (opcional), `team_id`, `era_id`.

**Problema de produto:** a decisão ótima de draft hoje é trivial — "escolha os maiores overalls". Não há recompensa por montar um time *coerente* (mesma era, mesmo clube, estilos que combinam), que é justamente a fantasia central de um jogo histórico.

---

## 2. Objetivo
Introduzir **Química de Elenco**: um índice (0–100) calculado a partir da coesão do elenco escolhido (era, clube e combinações de `trait`) que ajusta — de forma **limitada e transparente** — a força do time na simulação. O objetivo é transformar o draft num quebra-cabeça estratégico-temático, recompensando narrativas ("o Flamengo dos anos 80", "a seleção dos pontas") sem invalidar o valor do `overall`.

**Não-objetivo:** substituir o overall como fator principal; adicionar autenticação, novas telas de backend, ou persistência de histórico de partidas (fora do escopo deste épico).

---

## 3. Hipótese de valor
> **Acreditamos que** recompensar elencos coerentes com um bônus de química **para** jogadores que montam times temáticos **vai resultar em** drafts mais variados e maior reengajamento (rejogar para "fechar" combinações).
> **Saberemos que é verdade quando** observarmos aumento na variedade de elencos (menos concentração nos mesmos top-overalls), mais simulações por jogador e tempo maior na tela de montagem.

Premissa central: o bônus deve ser **perceptível, porém limitado** (teto explícito), para não anular a importância do overall nem desbalancear o jogo.

---

## 4. Métricas de sucesso
**Métricas primárias (sucesso do épico)**
- **Variedade de draft:** queda ≥ 20% no índice de concentração (ex.: % de aparições dos 10 jogadores mais escolhidos) em 4 semanas.
- **Reengajamento:** aumento ≥ 15% na média de simulações (`POST /game/:id/play`) por jogador/semana.
- **Engajamento na montagem:** aumento no nº de revisões de draft antes de simular (proxy de "otimização de química").

**Métricas de saúde / guarda-corpo (não podem piorar)**
- **Balanceamento:** distribuição de pontos/posição final da temporada não deve degenerar (ex.: % de campanhas com aproveitamento > 90% não deve disparar). Química limitada ao teto definido na seção 5.
- **Performance:** `POST /game/:id/play` sem regressão perceptível de latência (cálculo de química é O(nº de jogadores do elenco), trivial).
- **Estabilidade:** zero aumento de erros 5xx; nenhuma quebra em `playSeason` quando não há `trait`/dados incompletos.

**Instrumentação mínima sugerida:** logar o `chemistry.score` por simulação (sem dado pessoal) para acompanhar a distribuição real e calibrar constantes.

---

## 5. Modelo de design da Química (especificação funcional)
Esta seção define **o comportamento desejado**. As constantes são **calibráveis** (defaults abaixo); a fórmula deve viver isolada para facilitar ajuste.

Entrada: a lista de jogadores escalados de um game (do draft), cada um com `eraId`, `teamId`, `trait` (pode ser nulo) e `pos` (posição em campo).

**Componentes do score (base 50):**
1. **Coesão de era** — seja `maxEra` o tamanho do maior grupo de jogadores que compartilham a mesma era. Bônus = `max(0, (maxEra - 3)) × 4`.
2. **Coesão de clube** — seja `maxClube` o tamanho do maior grupo do mesmo clube. Bônus = `max(0, (maxClube - 2)) × 3`.
3. **Penalidade de fragmentação** — seja `nEras` o nº de eras distintas no elenco. Penalidade = `max(0, (nEras - 3)) × 5` (subtrai).
4. **Sinergias de trait** — para cada par sinérgico presente (catálogo na seção 5.1), +5, com teto de +15.

`score = clamp(50 + coesãoEra + coesãoClube − fragmentação + sinergias, 0, 100)`

**Aplicação na simulação (limitada):** a química vira um multiplicador no λ de ataque do **time do usuário** em `runSimulation`, dentro de `playSeason`:
`fatorQuimica = 0.90 + (score / 100) × 0.20` → faixa **[0.90, 1.10]**.
- Aplicar `fatorQuimica` ao `myLambda` (ataque do usuário). Não alterar o λ do adversário nesta primeira versão.
- **Teto/piso explícitos** garantem que a química nunca vale mais que ±10% de ataque — overall continua dominante.
- **Fora de escopo nesta versão:** aplicar química na simulação da tabela estimada (`simulateLeagueTable`) e nos adversários. Manter como está.

### 5.1 Catálogo inicial de sinergias de trait
A definir junto ao time, mas começar com um catálogo pequeno e explícito (dados, não código espalhado). Exemplo de partida (placeholder — confirmar `trait`s reais no seed):
- `Maestro` + `Velocista` → +5 (criação + profundidade)
- `Xerife` + `Goleiro Seguro` → +5 (solidez defensiva)
- `Artilheiro` + `Garçom` → +5 (finalização + assistência)

Se os valores de `trait` no banco ainda não estiverem populados, o componente de sinergia simplesmente contribui 0 — **não pode quebrar** o cálculo.

---

## 6. Escopo
**Dentro:** cálculo do índice de química (domínio puro), exposição do índice para leitura do elenco, e aplicação limitada na simulação do usuário, com o índice no retorno de `playSeason`.
**Fora:** autenticação; persistência de histórico de partidas (RISK-005); química na tabela estimada e nos adversários; UI/visual (frontend); catálogo extenso de sinergias.

---

## 7. Sequenciamento e dependências
1. **QUIM-1** (núcleo de cálculo — sem efeito colateral) → base de tudo.
2. **QUIM-2** (expor leitura) e **QUIM-3** (aplicar na simulação) dependem de QUIM-1; podem ir em paralelo após QUIM-1.
3. **QUIM-4** (catálogo de sinergias) pode ir junto de QUIM-1 ou logo depois; QUIM-1 deve tolerar catálogo vazio.

---

## 8. Histórias (especificações para agentes Claude)

> **Convenções para todas as histórias:**
> - Não há infraestrutura de testes no projeto (sem Jest/eslint instalados). Verificação obrigatória: `npx tsc --noEmit` (exit 0) e `npm run build` (verde). Não instale Jest/eslint.
> - Stack: NestJS 10, Prisma 7 com driver adapter. `tsconfig` tem `strictNullChecks:false`/`noImplicitAny:false` (não os ative).
> - Não altere comportamento existente fora do que a história pede. Sem over-engineering, sem abstrações especulativas.
> - Uma branch por história, commits atômicos. Atualize este arquivo marcando a história como ✅ ao concluir.
> - Posições canônicas já vivem em `src/common/positions.ts` (`POSITIONS`/`Position`). Reaproveite quando precisar tipar posição.

---

### QUIM-1 — Núcleo de cálculo da química (função pura, sem efeito colateral)

**Contexto:** precisamos de uma função isolada e testável que receba um elenco e devolva o índice de química e o detalhamento, conforme a seção 5 deste documento (`epics/EPIC-quimica-de-elenco.md`). Esta história **não** integra nada à simulação nem a endpoints — é só o domínio.

**Objetivo:** criar o módulo de cálculo de química, puro (sem Prisma, sem Nest, sem I/O), determinístico dado o input.

**Arquivos/locais:**
- Criar `src/chemistry/chemistry.ts` (lógica pura) — não criar módulo Nest ainda.
- Opcional: `src/chemistry/synergies.ts` para o catálogo de sinergias (ver QUIM-4); por ora pode exportar um array vazio `[]` e a função tolerar isso.

**Especificação (seguir seção 5):**
- Tipo de entrada: `interface SquadMember { eraId: string; teamId: string; trait: string | null; pos: string }`.
- Função: `computeChemistry(squad: SquadMember[]): { score: number; breakdown: { eraCohesion: number; clubCohesion: number; fragmentationPenalty: number; synergyBonus: number; distinctEras: number; maxEraCount: number; maxClubCount: number } }`.
- Implementar exatamente a fórmula da seção 5 (base 50; coesão era `(maxEra-3)×4`; coesão clube `(maxClube-2)×3`; fragmentação `(nEras-3)×5`; sinergias +5/par até +15; `clamp(…,0,100)`).
- Constantes (base, pesos, teto de sinergia, faixa do multiplicador) declaradas no topo do arquivo, nomeadas e fáceis de ajustar.
- Expor também `chemistryMultiplier(score: number): number` retornando `0.90 + (score/100)*0.20`.

**Critérios de aceite (verificáveis):**
- Elenco vazio → `score = 50` (base), multiplicador `1.0`; nenhuma exceção.
- 11 jogadores todos da mesma era e mesmo clube, sem trait → `score` no teto coerente com a fórmula (calcular e conferir manualmente); multiplicador ≤ 1.10.
- Elenco com 5 eras distintas → penalidade de fragmentação aplicada (score < 50 quando não houver coesão).
- `trait` nulo em todos → `synergyBonus = 0`, sem erro.
- `computeChemistry` é determinística e não acessa Prisma/rede/ambiente.

**Verificação:** `npx tsc --noEmit` (0) + `npm run build`. Para validar a lógica sem Jest, crie um script temporário `tmp-check-chemistry.ts` que importa e imprime resultados de 3 cenários, rode com `npx tsc` ou `node` via `tsx`, confira a saída e **apague o script antes do commit** (não versione).

**Restrições / fora de escopo:** não tocar em `game.service.ts`, controllers, módulos ou schema. Sem dependências novas.

---

### QUIM-2 — Expor a química do elenco para leitura

**Contexto:** o frontend precisa exibir a química do elenco montado (índice + breakdown) **antes** de simular. A função pura existe (QUIM-1). Esta história só lê dados e devolve o cálculo — sem alterar a simulação.

**Objetivo:** adicionar um endpoint de leitura que, dado um `gameId`, carregue o draft, monte os `SquadMember` e retorne `computeChemistry(...)`.

**Arquivos/locais:**
- `src/draft/draft.service.ts` e `src/draft/draft.controller.ts` (o draft já tem o relacionamento com `player`).
- Reusar `computeChemistry` de `src/chemistry/chemistry.ts`.

**Especificação:**
- Novo método no `DraftService`, ex.: `getChemistry(gameId: string)`, que faz `prisma.draft.findMany({ where: { game_id }, include: { player: true } })`, mapeia cada entrada para `SquadMember` (`eraId: player.era_id`, `teamId: player.team_id`, `trait: player.trait`, `pos: slot_pos`) e retorna `computeChemistry(squad)`.
- Novo endpoint **GET** no `DraftController`, ex.: `GET /draft/:gameId/chemistry`. Manter o padrão dos demais (controller só delega ao service).

**Critérios de aceite:**
- `GET /draft/:gameId/chemistry` devolve `{ score, breakdown }` para um game com draft salvo.
- Game sem draft → elenco vazio → retorna o score base (50) sem erro.
- Não altera os endpoints/comportamentos existentes de draft.

**Verificação:** `npx tsc --noEmit` (0) + `npm run build`. Verificação funcional (se houver banco): `POST /draft` e então `GET /draft/:gameId/chemistry` retorna score coerente.

**Restrições / fora de escopo:** não alterar `playSeason`; não mudar o shape das respostas existentes; sem schema novo.

---

### QUIM-3 — Aplicar química (limitada) na simulação do usuário

**Contexto:** com o núcleo (QUIM-1) pronto, integrar a química ao `playSeason` para que ela ajuste o ataque do time do usuário dentro do teto ±10% (seção 5), e devolver o índice no retorno para transparência.

**Objetivo:** multiplicar o λ de ataque do usuário por `chemistryMultiplier(score)` e incluir `chemistry` no objeto de resposta de `playSeason`.

**Arquivos/locais:** `src/game/game.service.ts` (`playSeason`, `runSimulation`).

**Especificação:**
- Em `playSeason`, já há `draftEntries` carregados com `include: { player: true }`. Monte os `SquadMember` (use `era_id`, `team_id`, `trait`, `slot_pos`) e calcule `score` via `computeChemistry`.
- Calcule `fator = chemistryMultiplier(score)` (faixa [0.90, 1.10]).
- Passe o fator para `runSimulation` e aplique-o **apenas** ao `myLambda` (ataque do usuário). Não altere `oppLambda`, `HOME_BOOST`, `BASE_LAMBDA` nem a lógica de Poisson.
- Incluir no retorno de `playSeason` um campo `chemistry: { score, breakdown }` (adicional, sem remover/renomear campos existentes — `schedule`, `matches`, `leagueTable`, `pts/v/e/d/gf/gc` permanecem).
- **Não** aplicar química em `simulateLeagueTable` nem aos adversários (fora de escopo).

**Critérios de aceite:**
- Com química no máximo, o ataque do usuário sobe no máximo 10% (verificável pela fórmula do λ); com química baixa, cai no máximo 10%.
- Resposta de `playSeason` passa a conter `chemistry.score` e `chemistry.breakdown`; demais campos inalterados.
- Sem draft / elenco vazio → `score = 50` → fator `1.0` → simulação idêntica ao comportamento atual (sem regressão).
- Nenhuma exceção quando `trait` é nulo.

**Verificação:** `npx tsc --noEmit` (0) + `npm run build`. Conferir no diff que `oppLambda` e as constantes de simulação não mudaram. Se houver banco, comparar uma simulação com elenco coeso vs. fragmentado e observar `chemistry.score` diferente no retorno.

**Restrições / fora de escopo:** não persistir química no banco (sem migration); não alterar `simulateLeagueTable`; preservar os contratos de resposta existentes.

---

### QUIM-4 — Catálogo de sinergias de trait (dados explícitos)

**Contexto:** o componente de sinergia (seção 5.1) precisa de um catálogo de pares de `trait` que se reforçam. Deve ser **dado declarativo** e isolado, fácil de editar pelo time, e o cálculo (QUIM-1) já deve tolerar catálogo vazio.

**Objetivo:** definir o catálogo inicial de sinergias e plugá-lo no cálculo, validando contra os `trait`s reais do seed.

**Arquivos/locais:** `src/chemistry/synergies.ts` (catálogo) e o ponto de consumo em `src/chemistry/chemistry.ts`.

**Especificação:**
- Antes de codar: **levante os valores reais de `trait`** existentes em `prisma/seed.ts` (a coluna pode estar pouco populada). Use só `trait`s que existem; não invente strings que não aparecem nos dados.
- Catálogo como lista de pares: `interface TraitSynergy { a: string; b: string; bonus: number }`. Começar com 2–3 pares (bonus 5), respeitando o teto de +15 já aplicado em QUIM-1.
- A contagem de sinergia conta, no máximo uma vez por par presente no elenco (não multiplicar por nº de ocorrências), conforme a seção 5.

**Critérios de aceite:**
- Catálogo só contém `trait`s presentes no seed (listar no PR quais foram usados).
- Elenco sem nenhum par sinérgico → `synergyBonus = 0`.
- Teto de +15 respeitado mesmo com muitos pares.

**Verificação:** `npx tsc --noEmit` (0) + `npm run build`. Documentar no PR a lista de `trait`s reais encontrados no seed e os pares escolhidos.

**Restrições / fora de escopo:** não alterar o seed nem o schema; não criar UI de configuração.

---

## 9. Riscos e mitigações
- **Química dominante (desbalanceia):** mitigado pelo teto ±10% e por logar `score` para calibrar. Constantes isoladas para ajuste rápido.
- **Dados de `trait` incompletos:** o cálculo tolera ausência (sinergia 0); QUIM-4 só usa `trait`s reais.
- **Acoplamento à simulação:** núcleo puro (QUIM-1) mantém a regra testável e separada do `game.service`.
- **Dependência da migration de `trait` (RISK-001):** se a coluna `trait` não existir no banco, queries de Player falham — garantir que a migration do RISK-001 esteja aplicada antes de QUIM-2/QUIM-3 em ambiente real.

## 10. Definição de pronto (épico)
- QUIM-1..4 entregues, `tsc`+`build` verdes.
- `playSeason` retorna `chemistry` e aplica o multiplicador dentro do teto, sem regressão para elenco vazio.
- `score` instrumentado em log para calibração.
- Este documento atualizado com as histórias marcadas como concluídas.
