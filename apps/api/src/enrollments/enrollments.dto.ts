import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  ArrayUnique,
  MinLength,
} from 'class-validator';
import { EnrollmentResponse } from '../courses/responses.dto';

export class EnrollDto {
  @ApiProperty() @IsString() @MaxLength(100) courseId!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) invitationCode?: string;
}
export class AssignDto {
  @ApiProperty() @IsString() @MaxLength(100) userId!: string;
}
export class BulkAssignDto {
  @ApiProperty({ type: [String], minItems: 1, maxItems: 100 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(100, { each: true })
  userIds!: string[];
}
export class BulkEnrollmentPreviewItem {
  @ApiProperty() userId!: string;
  @ApiPropertyOptional() name?: string;
  @ApiPropertyOptional() email?: string;
  @ApiProperty({ enum: ['ELIGIBLE', 'ENROLLED', 'UNAVAILABLE'] }) status!:
    'ELIGIBLE' | 'ENROLLED' | 'UNAVAILABLE';
}
export class BulkEnrollmentPreview {
  @ApiProperty() courseId!: string;
  @ApiProperty() total!: number;
  @ApiProperty() eligible!: number;
  @ApiProperty() alreadyEnrolled!: number;
  @ApiProperty() unavailable!: number;
  @ApiProperty() canAssign!: boolean;
  @ApiProperty({ type: [BulkEnrollmentPreviewItem] }) items!: BulkEnrollmentPreviewItem[];
}
export class BulkEnrollmentResult {
  @ApiProperty() courseId!: string;
  @ApiProperty() created!: number;
  @ApiProperty() unchanged!: number;
  @ApiProperty({ type: [EnrollmentResponse] }) items!: EnrollmentResponse[];
}
export class InviteDto {
  @ApiProperty() @IsEmail() email!: string;
}
export class AccommodationDto {
  @ApiPropertyOptional() @IsOptional() @IsISO8601() deadlineExtension?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(50) extraAttempts?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(480) extraTimeMinutes?: number;
}
