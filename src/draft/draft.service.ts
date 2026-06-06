import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDraftDto } from './dto/create-draft.dto';

@Injectable()
export class DraftService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateDraftDto) {
    const data = dto.players.map((entry) => ({
      game_id: dto.game_id,
      player_id: entry.player_id,
      slot_pos: entry.slot_pos,
      slot_index: entry.slot_index,
    }));

    return this.prisma.draft.createMany({ data });
  }

  findByGame(gameId: string) {
    return this.prisma.draft.findMany({
      where: { game_id: gameId },
      include: { player: true },
      orderBy: { slot_index: 'asc' },
    });
  }
}
