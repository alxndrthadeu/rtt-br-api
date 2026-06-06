import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { GameModule } from './game/game.module';
import { MatchModule } from './match/match.module';
import { DraftModule } from './draft/draft.module';
import { PlayerModule } from './player/player.module';
import { RankingModule } from './ranking/ranking.module';
import { EraModule } from './era/era.module';
import { TeamModule } from './team/team.module';
import { TeamStatsModule } from './team-stats/team-stats.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    EraModule,
    TeamModule,
    PlayerModule,
    GameModule,
    MatchModule,
    DraftModule,
    RankingModule,
    TeamStatsModule,
  ],
})
export class AppModule {}
