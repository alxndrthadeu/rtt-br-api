import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { RankingService } from './ranking.service';
import { CreateRankingDto } from './dto/create-ranking.dto';

@Controller('ranking')
export class RankingController {
  constructor(private readonly rankingService: RankingService) {}

  @Post()
  create(@Body() dto: CreateRankingDto) {
    return this.rankingService.create(dto);
  }

  @Get('player/:uuid')
  findByPlayer(@Param('uuid') uuid: string) {
    return this.rankingService.findByPlayer(uuid);
  }
}
