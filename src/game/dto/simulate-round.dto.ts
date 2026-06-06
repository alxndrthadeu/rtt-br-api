import { IsInt, Max, Min } from 'class-validator';

export class SimulateRoundDto {
  @IsInt()
  @Min(1)
  @Max(99)
  attack_ovr: number;

  @IsInt()
  @Min(1)
  @Max(99)
  def_ovr: number;
}
