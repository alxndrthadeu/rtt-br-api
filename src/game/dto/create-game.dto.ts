import { IsString, IsNotEmpty } from 'class-validator';

export class CreateGameDto {
  @IsString()
  @IsNotEmpty()
  player_uuid: string;

  @IsString()
  @IsNotEmpty()
  formation: string;
}
