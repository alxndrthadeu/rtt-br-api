import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const ATTACK_ROLES = new Set(['CA', 'PE', 'PD', 'MEI']);
const DEFENSE_ROLES = new Set(['GK', 'ZAG', 'LD', 'LE', 'MEI']);
const MIN_PLAYERS = 5;

@Injectable()
export class TeamStatsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.teamEraStat.findMany({ orderBy: [{ team: 'asc' }, { era: 'asc' }] });
  }

  async refresh() {
    const players = await this.prisma.player.findMany({ include: { team: true, era: true } });

    const groups = new Map<string, { team: string; era: string; players: typeof players }>();
    for (const p of players) {
      const key = `${p.team.name}|||${p.era.name}`;
      if (!groups.has(key)) groups.set(key, { team: p.team.name, era: p.era.name, players: [] });
      groups.get(key)!.players.push(p);
    }

    const avg = (list: typeof players) =>
      list.length ? Math.round(list.reduce((s, p) => s + p.overall, 0) / list.length) : 0;

    const data: { team: string; era: string; atk_ovr: number; def_ovr: number }[] = [];
    for (const { team, era, players: gp } of groups.values()) {
      if (gp.length < MIN_PLAYERS) continue;
      const atkPlayers = gp.filter(p => ATTACK_ROLES.has(p.pos_principal));
      const defPlayers = gp.filter(p => DEFENSE_ROLES.has(p.pos_principal));
      if (!atkPlayers.length || !defPlayers.length) continue;
      data.push({ team, era, atk_ovr: avg(atkPlayers), def_ovr: avg(defPlayers) });
    }

    // Substitui tudo de uma vez — delete + insertMany em transação
    await this.prisma.$transaction([
      this.prisma.teamEraStat.deleteMany(),
      this.prisma.teamEraStat.createMany({ data }),
    ]);

    return { refreshed: data.length };
  }
}
