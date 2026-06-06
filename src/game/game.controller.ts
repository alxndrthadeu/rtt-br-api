import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { GameService } from './game.service';
import { CreateGameDto } from './dto/create-game.dto';
import { UpdateGameDto } from './dto/update-game.dto';
import { SimulateRoundDto } from './dto/simulate-round.dto';

@Controller('game')
export class GameController {
  constructor(private readonly gameService: GameService) {}

  @Post()
  create(@Body() dto: CreateGameDto) {
    return this.gameService.create(dto);
  }

  @Get('player/:uuid')
  findByPlayer(@Param('uuid') uuid: string) {
    return this.gameService.findByPlayer(uuid);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.gameService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateGameDto) {
    return this.gameService.update(id, dto);
  }

  // Gera calendário com times reais + simula os 38 jogos + persiste tudo de uma vez
  @Post(':id/play')
  playSeason(@Param('id') id: string, @Body() dto: SimulateRoundDto) {
    return this.gameService.playSeason(id, dto.attack_ovr, dto.def_ovr);
  }
}
