import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CriterionScoreDto {
  @ApiProperty() @IsString() @MaxLength(80) criterionId!: string;
  @ApiProperty() @IsInt() @Min(0) @Max(100) points!: number;
}
export class GradeDto {
  @ApiProperty({ type: [CriterionScoreDto] })
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => CriterionScoreDto)
  criteriaScores!: CriterionScoreDto[];
  @ApiProperty() @IsString() @MaxLength(10000) feedback!: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() revisionRequested = false;
}
export class GradingQuery {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) courseId?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
}
