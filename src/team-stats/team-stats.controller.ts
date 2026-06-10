import { Controller, Get, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { TeamStatsService } from './team-stats.service';

@Controller('team-stats')
export class TeamStatsController {
  constructor(private readonly teamStatsService: TeamStatsService) {}

  @Get()
  findAll() {
    return this.teamStatsService.findAll();
  }

  // Recalculo custoso (delete + recreate de toda a tabela): limite estrito.
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Post('refresh')
  refresh() {
    return this.teamStatsService.refresh();
  }
}
