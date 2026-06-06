import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGameDto } from './dto/create-game.dto';
import { UpdateGameDto } from './dto/update-game.dto';

const HOME_BOOST = 1.08;
const BASE_LAMBDA = 1.2;
const POOL_SIZE = 19;

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
  // Gera o calendário + simula todos os 38 jogos + persiste tudo em uma transação.
  // O frontend recebe os resultados completos e apenas navega localmente.

  async playSeason(gameId: string, attackOvr: number, defOvr: number): Promise<object> {
    const game = await this.prisma.game.findUnique({ where: { id: gameId } });
    if (!game) throw new NotFoundException('Game não encontrado');

    const schedule = await this.buildSchedule();

    // Simula todos os jogos em memória
    const matchData = schedule.map(({ round, opponent, isHome }) => {
      const { myGoals, oppGoals, result } = this.runSimulation(
        attackOvr, defOvr,
        opponent.atkOvr, opponent.defOvr,
        isHome,
      );
      return {
        game_id: gameId,
        rodada: round,
        opp_team: opponent.team,
        opp_era: opponent.era,
        opp_ovr: Math.round((opponent.atkOvr + opponent.defOvr) / 2),
        is_home: isHome,
        my_goals: myGoals,
        opp_goals: oppGoals,
        result,
      };
    });

    // Computa o resumo da temporada
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

    // Persiste apenas o resumo da temporada no game — partidas ficam no localStorage do cliente
    await this.prisma.game.update({
      where: { id: gameId },
      data: { pts: stats.pts, v: stats.v, e: stats.e, d: stats.d, gf: stats.gf, gc: stats.gc },
    });

    return { schedule, matches: matchData, ...stats };
  }

  // ─── Internal ────────────────────────────────────────────────────────────────

  private async buildSchedule(): Promise<ScheduledMatch[]> {
    const pool = await this.buildOpponentPool();

    if (pool.length < 2) {
      throw new BadRequestException(
        'Dados insuficientes no banco para gerar calendário (mín. 2 times/eras com elenco completo)',
      );
    }

    // Embaralha e seleciona até POOL_SIZE adversários
    const firstTurn = pool.sort(() => Math.random() - 0.5).slice(0, POOL_SIZE);
    // Segundo turno com ordem diferente
    const secondTurn = [...firstTurn].sort(() => Math.random() - 0.5);
    // Define casa/fora para o primeiro turno; segundo turno inverte
    const homeInFirst = firstTurn.map(() => Math.random() > 0.5);

    const schedule: ScheduledMatch[] = [];

    firstTurn.forEach((opp, i) => {
      schedule.push({ round: i + 1, opponent: opp, isHome: homeInFirst[i] });
    });

    secondTurn.forEach((opp, i) => {
      const firstIdx = firstTurn.findIndex(o => o.team === opp.team && o.era === opp.era);
      schedule.push({
        round: firstTurn.length + i + 1,
        opponent: opp,
        isHome: !homeInFirst[firstIdx],
      });
    });

    return schedule;
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
