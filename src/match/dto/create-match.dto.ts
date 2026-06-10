import { IsBoolean, IsInt, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateMatchDto {
  @IsUUID()
  game_id: string;

  @IsInt()
  rodada: number;

  @IsString()
  opp_team: string;

  @IsString()
  opp_era: string;

  @IsInt()
  opp_ovr: number;

  @IsInt()
  my_goals: number;

  @IsInt()
  opp_goals: number;

  @IsString()
  result: string;

  @IsBoolean()
  @IsOptional()
  is_home?: boolean;
}
