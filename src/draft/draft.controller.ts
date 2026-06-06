import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { DraftService } from './draft.service';
import { CreateDraftDto } from './dto/create-draft.dto';

@Controller('draft')
export class DraftController {
  constructor(private readonly draftService: DraftService) {}

  @Post()
  create(@Body() dto: CreateDraftDto) {
    return this.draftService.create(dto);
  }

  @Get(':gameId')
  findByGame(@Param('gameId') gameId: string) {
    return this.draftService.findByGame(gameId);
  }
}
