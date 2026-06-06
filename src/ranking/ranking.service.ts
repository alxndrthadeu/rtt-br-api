import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRankingDto } from './dto/create-ranking.dto';

@Injectable()
export class RankingService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateRankingDto) {
    const { game_id, rank, destaque_player_id, destaque_overall, pts, v, e, d, gf, gc } = dto;

    const [ranking] = await this.prisma.$transaction([
      this.prisma.ranking.create({
        data: { game_id, rank, destaque_player_id, destaque_overall },
        include: { destaque_player: true },
      }),
      this.prisma.game.update({
        where: { id: game_id },
        data: { ranking: rank, pts, v, e, d, gf, gc },
      }),
    ]);

    return ranking;
  }

  findByPlayer(playerUuid: string) {
    return this.prisma.ranking.findMany({
      where: { game: { player_uuid: playerUuid } },
      include: { game: true, destaque_player: true },
      orderBy: { created_at: 'desc' },
    });
  }
}
