import { IsInt, IsString, IsUUID } from 'class-validator';

export class CreateRankingDto {
  @IsUUID()
  game_id: string;

  @IsString()
  rank: string;

  @IsUUID()
  destaque_player_id: string;

  @IsInt()
  destaque_overall: number;

  @IsInt()
  pts: number;

  @IsInt()
  v: number;

  @IsInt()
  e: number;

  @IsInt()
  d: number;

  @IsInt()
  gf: number;

  @IsInt()
  gc: number;
}
