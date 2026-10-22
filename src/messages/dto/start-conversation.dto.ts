import { IsMongoId, IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class StartConversationDto {
  @IsMongoId()
  artisanProfileId: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  text: string;
}