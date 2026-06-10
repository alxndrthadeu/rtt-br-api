import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGameDto } from './dto/create-game.dto';
import { UpdateGameDto } from './dto/update-game.dto';
import { Position } from '../common/positions';

const HOME_BOOST = 1.08;
const BASE_LAMBDA = 1.2;
const POOL_SIZE = 19;

// Pesos por posição para selecionar artilheiros
const SCORER_WEIGHTS: Record<Position, number> = {
  CA: 8, PE: 5, PD: 5, MEI: 3, LD: 1, LE: 1, ZAG: 1, GK: 0,
};

interface ScorerEntry { name: string; minute: number }
interface SquadPlayer  { name: string; pos: string }

interface OpponentEntry {
  team: string;
  era: string;
  atkOvr: number;
  defOvr: number;
}

interface ScheduledMatch {
  round: number;
  opponent: OpponentEntry;
  isHome: boolean;
}

@Injectable()
export class GameService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateGameDto) {
    return this.prisma.game.create({ data: dto });
  }

  async findOne(id: string) {
    const game = await this.prisma.game.findUnique({ where: { id } });
    if (!game) throw new NotFoundException('Game não encontrado');
    return game;
  }

  findByPlayer(playerUuid: string) {
    return this.prisma.game.findMany({
      where: { player_uuid: playerUuid },
      orderBy: { created_at: 'desc' },
    });
  }

  update(id: string, dto: UpdateGameDto) {
    return this.prisma.game.update({ where: { id }, data: dto });
  }

  // ─── Play Season ─────────────────────────────────────────────────────────────

  async playSeason(gameId: string, attackOvr: number, defOvr: number): Promise<object> {
    const game = await this.prisma.game.findUnique({ where: { id: gameId } });
    if (!game) throw new NotFoundException('Game não encontrado');

    const { schedule, opponents, pool } = await this.buildSchedule();

    // ── Meus jogadores (do draft salvo) ──────────────────────────────────────
    const draftEntries = await this.prisma.draft.findMany({
      where: { game_id: gameId },
      include: { player: true },
    });
    const myPlayers: SquadPlayer[] = draftEntries.map(d => ({
      name: d.player.name,
      pos: d.slot_pos,   // posição real em campo, não pos_principal
    }));

    // ── Jogadores dos adversários (batch único) ───────────────────────────────
    const oppTeamNames = [...new Set(schedule.map(s => s.opponent.team))];
    const oppEraNames  = [...new Set(schedule.map(s => s.opponent.era))];

    const allOppPlayers = await this.prisma.player.findMany({
      where: {
        team: { name: { in: oppTeamNames } },
        era:  { name: { in: oppEraNames  } },
      },
      include: { team: true, era: true },
    });

    // Agrupa por "time|||era"
    const oppByKey = new Map<string, SquadPlayer[]>();
    for (const p of allOppPlayers) {
      const key = `${p.team.name}|||${p.era.name}`;
      if (!oppByKey.has(key)) oppByKey.set(key, []);
      oppByKey.get(key)!.push({ name: p.name, pos: p.pos_principal });
    }

    // ── Simula todos os jogos em memória ──────────────────────────────────────
    const matchData = schedule.map(({ round, opponent, isHome }) => {
      const { myGoals, oppGoals, result } = this.runSimulation(
        attackOvr, defOvr,
        opponent.atkOvr, opponent.defOvr,
        isHome,
      );

      const oppSquad = oppByKey.get(`${opponent.team}|||${opponent.era}`) ?? [];

      return {
        game_id:     gameId,
        rodada:      round,
        opp_team:    opponent.team,
        opp_era:     opponent.era,
        opp_ovr:     Math.round((opponent.atkOvr + opponent.defOvr) / 2),
        is_home:     isHome,
        my_goals:    myGoals,
        opp_goals:   oppGoals,
        result,
        my_scorers:  this.pickScorers(myGoals,  myPlayers),
        opp_scorers: this.pickScorers(oppGoals, oppSquad),
      };
    });

    // ── Resumo da temporada ───────────────────────────────────────────────────
    const stats = matchData.reduce(
      (acc, m) => ({
        pts: acc.pts + (m.result === 'V' ? 3 : m.result === 'E' ? 1 : 0),
        v:   acc.v   + (m.result === 'V' ? 1 : 0),
        e:   acc.e   + (m.result === 'E' ? 1 : 0),
        d:   acc.d   + (m.result === 'D' ? 1 : 0),
        gf:  acc.gf  + m.my_goals,
        gc:  acc.gc  + m.opp_goals,
      }),
      { pts: 0, v: 0, e: 0, d: 0, gf: 0, gc: 0 },
    );

    await this.prisma.game.update({
      where: { id: gameId },
      data: { pts: stats.pts, v: stats.v, e: stats.e, d: stats.d, gf: stats.gf, gc: stats.gc },
    });

    const leagueTable = this.simulateLeagueTable(matchData, opponents, pool);

    return { schedule, matches: matchData, leagueTable, ...stats };
  }

  // ─── Artilheiros ─────────────────────────────────────────────────────────────

  private pickScorers(goals: number, players: SquadPlayer[]): ScorerEntry[] {
    if (goals === 0 || players.length === 0) return [];

    const pool = players
      .filter(p => (SCORER_WEIGHTS[p.pos] ?? 0) > 0)
      .map(p => ({ name: p.name, weight: SCORER_WEIGHTS[p.pos] ?? 2 }));

    if (pool.length === 0) return [];

    const totalWeight = pool.reduce((s, p) => s + p.weight, 0);
    const minutes = Array.from({ length: goals }, () =>
      1 + Math.floor(Math.random() * 90),
    ).sort((a, b) => a - b);

    return minutes.map(minute => {
      let r = Math.random() * totalWeight;
      for (const p of pool) {
        r -= p.weight;
        if (r <= 0) return { name: p.name, minute };
      }
      return { name: pool[pool.length - 1].name, minute };
    });
  }

  // ─── Schedule ────────────────────────────────────────────────────────────────

  private async buildSchedule(): Promise<{ schedule: ScheduledMatch[]; opponents: OpponentEntry[]; pool: OpponentEntry[] }> {
    const pool = await this.buildOpponentPool();

    if (pool.length < 2) {
      throw new BadRequestException(
        'Dados insuficientes no banco para gerar calendário (mín. 2 times/eras com elenco completo)',
      );
    }

    const firstTurn  = pool.sort(() => Math.random() - 0.5).slice(0, POOL_SIZE);
    const secondTurn = [...firstTurn].sort(() => Math.random() - 0.5);
    const homeInFirst = firstTurn.map(() => Math.random() > 0.5);

    const schedule: ScheduledMatch[] = [];
    firstTurn.forEach((opp, i) =>
      schedule.push({ round: i + 1, opponent: opp, isHome: homeInFirst[i] }),
    );
    secondTurn.forEach((opp, i) => {
      const firstIdx = firstTurn.findIndex(o => o.team === opp.team && o.era === opp.era);
      schedule.push({ round: firstTurn.length + i + 1, opponent: opp, isHome: !homeInFirst[firstIdx] });
    });

    return { schedule, opponents: firstTurn, pool };
  }

  // ─── Tabela estimada (simulação em background) ────────────────────────────────

  private simulateLeagueTable(
    userMatches: Array<{ opp_team: string; opp_era: string; my_goals: number; opp_goals: number; result: string }>,
    opponents: OpponentEntry[],
    pool: OpponentEntry[],
  ): Array<{ team: string; era: string; pts: number; v: number; e: number; d: number; gf: number; gc: number }> {
    type Entry = { team: string; era: string; pts: number; v: number; e: number; d: number; gf: number; gc: number };
    const table = new Map<string, Entry>();

    // ── Entrada do usuário (resultados reais) ────────────────────────────────
    const userEntry: Entry = { team: 'Seu Time', era: '', pts: 0, v: 0, e: 0, d: 0, gf: 0, gc: 0 };
    for (const m of userMatches) {
      userEntry.gf += m.my_goals;
      userEntry.gc += m.opp_goals;
      if (m.result === 'V')      { userEntry.pts += 3; userEntry.v++; }
      else if (m.result === 'E') { userEntry.pts += 1; userEntry.e++; }
      else                       { userEntry.d++; }
    }
    table.set('__user__', userEntry);

    // ── Cada adversário: resultado vs usuário + 36 jogos simulados ───────────
    for (const opp of opponents) {
      const key = `${opp.team}|||${opp.era}`;
      const e: Entry = { team: opp.team, era: opp.era, pts: 0, v: 0, e: 0, d: 0, gf: 0, gc: 0 };

      // Resultados reais contra o usuário (perspectiva do adversário)
      for (const m of userMatches) {
        if (m.opp_team !== opp.team || m.opp_era !== opp.era) continue;
        e.gf += m.opp_goals;
        e.gc += m.my_goals;
        const r = m.result === 'V' ? 'D' : m.result === 'D' ? 'V' : 'E';
        if (r === 'V')      { e.pts += 3; e.v++; }
        else if (r === 'E') { e.pts += 1; e.e++; }
        else                { e.d++; }
      }

      // 36 jogos estimados contra outros times do pool
      for (let i = 0; i < 36; i++) {
        let foe: OpponentEntry;
        let attempts = 0;
        do { foe = pool[Math.floor(Math.random() * pool.length)]; attempts++; }
        while (foe.team === opp.team && foe.era === opp.era && attempts < 10);

        const isHome = Math.random() > 0.5;
        const { myGoals, oppGoals, result } = this.runSimulation(
          opp.atkOvr, opp.defOvr, foe.atkOvr, foe.defOvr, isHome,
        );
        e.gf += myGoals;
        e.gc += oppGoals;
        if (result === 'V')      { e.pts += 3; e.v++; }
        else if (result === 'E') { e.pts += 1; e.e++; }
        else                     { e.d++; }
      }

      table.set(key, e);
    }

    return [...table.values()].sort((a, b) => {
      const ptsDiff = b.pts - a.pts;
      if (ptsDiff !== 0) return ptsDiff;
      const gdDiff = (b.gf - b.gc) - (a.gf - a.gc);
      if (gdDiff !== 0) return gdDiff;
      return b.gf - a.gf;
    });
  }

  private async buildOpponentPool(): Promise<OpponentEntry[]> {
    const rows = await this.prisma.teamEraStat.findMany();
    if (rows.length < 2) {
      throw new BadRequestException(
        'Tabela team_era_stats vazia ou insuficiente — rode POST /team-stats/refresh primeiro',
      );
    }
    return rows.map(r => ({ team: r.team, era: r.era, atkOvr: r.atk_ovr, defOvr: r.def_ovr }));
  }

  // ─── Simulation ──────────────────────────────────────────────────────────────

  private poissonRandom(lambda: number): number {
    if (lambda <= 0) return 0;
    const L = Math.exp(-lambda);
    let k = 0, p = 1;
    do { k++; p *= Math.random(); } while (p > L);
    return k - 1;
  }

  private runSimulation(myAtk: number, myDef: number, oppAtk: number, oppDef: number, isHome: boolean) {
    const myLambda  = BASE_LAMBDA * (myAtk  / oppDef) * (isHome ? HOME_BOOST : 1);
    const oppLambda = BASE_LAMBDA * (oppAtk / myDef)  * (isHome ? 1 : HOME_BOOST);
    const myGoals   = this.poissonRandom(myLambda);
    const oppGoals  = this.poissonRandom(oppLambda);
    const result    = myGoals > oppGoals ? 'V' : myGoals === oppGoals ? 'E' : 'D';
    return { myGoals, oppGoals, result };
  }
}
