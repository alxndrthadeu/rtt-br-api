import { Controller, Get } from '@nestjs/common';
import { EraService } from './era.service';

@Controller('eras')
export class EraController {
  constructor(private readonly eraService: EraService) {}

  @Get()
  findAll() {
    return this.eraService.findAll();
  }
}
