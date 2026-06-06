import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class EraService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.era.findMany({ orderBy: { name: 'asc' } });
  }
}
