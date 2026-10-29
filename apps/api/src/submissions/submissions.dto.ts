import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class DraftDto {
  @ApiProperty() @IsString() @MaxLength(20000) text!: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2000)
  link?: string;
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(5)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  assetIds!: string[];
}
export class SubmitDto {
  @ApiProperty() @IsUUID() requestId!: string;
}
