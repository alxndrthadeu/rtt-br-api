import { Module } from '@nestjs/common';
import { EraController } from './era.controller';
import { EraService } from './era.service';

@Module({
  controllers: [EraController],
  providers: [EraService],
})
export class EraModule {}
