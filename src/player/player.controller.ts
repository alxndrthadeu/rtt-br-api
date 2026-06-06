import { Controller, Get, Query } from '@nestjs/common';
import { PlayerService } from './player.service';

@Controller('players')
export class PlayerController {
  constructor(private readonly playerService: PlayerService) {}

  @Get()
  findAll(@Query('eraId') eraId?: string, @Query('teamId') teamId?: string) {
    return this.playerService.findAll(eraId, teamId);
  }
}
