import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';

class DraftEntryDto {
  @IsUUID()
  player_id: string;

  @IsString()
  slot_pos: string;

  @IsInt()
  slot_index: number;
}

export class CreateDraftDto {
  @IsUUID()
  game_id: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DraftEntryDto)
  players: DraftEntryDto[];
}
