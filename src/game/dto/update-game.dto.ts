import { IsString, IsInt, IsOptional } from 'class-validator';

export class UpdateGameDto {
  @IsString()
  @IsOptional()
  ranking?: string;

  @IsInt()
  @IsOptional()
  pts?: number;

  @IsInt()
  @IsOptional()
  v?: number;

  @IsInt()
  @IsOptional()
  e?: number;

  @IsInt()
  @IsOptional()
  d?: number;

  @IsInt()
  @IsOptional()
  gf?: number;

  @IsInt()
  @IsOptional()
  gc?: number;

  @IsInt()
  @IsOptional()
  rerolls_used?: number;
}
