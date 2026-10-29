import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsISO8601, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class ProgressDto {
  @ApiProperty() @IsUUID() eventId!: string;
  @ApiProperty() @IsString() @MaxLength(100) activityId!: string;
  @ApiProperty({ enum: ['VIEWED', 'COMPLETED'] }) @IsIn(['VIEWED', 'COMPLETED']) state!:
    'VIEWED' | 'COMPLETED';
  @ApiPropertyOptional() @IsOptional() @IsISO8601() clientAt?: string;
}
