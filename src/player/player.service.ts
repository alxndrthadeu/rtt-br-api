import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PlayerService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(eraId?: string, teamId?: string) {
    return this.prisma.player.findMany({
      where: {
        ...(eraId && { era_id: eraId }),
        ...(teamId && { team_id: teamId }),
      },
      include: { era: true, team: true },
      orderBy: { overall: 'desc' },
    });
  }
}
