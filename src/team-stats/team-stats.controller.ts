import { Controller, Get, Post } from '@nestjs/common';
import { TeamStatsService } from './team-stats.service';

@Controller('team-stats')
export class TeamStatsController {
  constructor(private readonly teamStatsService: TeamStatsService) {}

  @Get()
  findAll() {
    return this.teamStatsService.findAll();
  }

  @Post('refresh')
  refresh() {
    return this.teamStatsService.refresh();
  }
}
