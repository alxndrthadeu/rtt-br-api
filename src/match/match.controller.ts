import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { MatchService } from './match.service';
import { CreateMatchDto } from './dto/create-match.dto';

@Controller('match')
export class MatchController {
  constructor(private readonly matchService: MatchService) {}

  @Post()
  create(@Body() dto: CreateMatchDto) {
    return this.matchService.create(dto);
  }

  @Get('game/:gameId')
  findByGame(@Param('gameId') gameId: string) {
    return this.matchService.findByGame(gameId);
  }
}
