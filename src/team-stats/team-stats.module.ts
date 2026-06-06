import { Module } from '@nestjs/common';
import { TeamStatsController } from './team-stats.controller';
import { TeamStatsService } from './team-stats.service';

@Module({
  controllers: [TeamStatsController],
  providers: [TeamStatsService],
})
export class TeamStatsModule {}
