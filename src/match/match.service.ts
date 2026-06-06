import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMatchDto } from './dto/create-match.dto';

@Injectable()
export class MatchService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateMatchDto) {
    return this.prisma.match.create({ data: dto });
  }

  findByGame(gameId: string) {
    return this.prisma.match.findMany({
      where: { game_id: gameId },
      orderBy: { rodada: 'asc' },
    });
  }
}
