import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDefined,
  IsIn,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidateNested,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CatalogQuery {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) search?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) subject?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30) level?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) language?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) format?: string;
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 20;
}
export class CreateCourseDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(150) title!: string;
  @ApiProperty() @IsString() @MaxLength(1000) summary!: string;
  @ApiProperty() @IsString() @MaxLength(80) subject!: string;
  @ApiProperty() @IsIn(['Beginner', 'Intermediate', 'Advanced']) level!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) language = 'en';
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isPublic = false;
}
export class QuestionDto {
  @ApiProperty() @IsIn(['SINGLE', 'MULTIPLE', 'SHORT_TEXT']) kind!:
    'SINGLE' | 'MULTIPLE' | 'SHORT_TEXT';
  @ApiProperty() @IsString() @MaxLength(2000) prompt!: string;
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  options!: string[];
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  answer!: string[];
  @ApiProperty() @IsString() @MaxLength(2000) explanation!: string;
  @ApiProperty() @IsInt() @Min(1) @Max(100) points!: number;
}
export class AssessmentDto {
  @ApiProperty() @IsInt() @Min(1) @Max(50) maxAttempts!: number;
  @ApiProperty() @IsInt() @Min(1) @Max(100) passPercent!: number;
  @ApiProperty() @IsIn(['AFTER_SUBMIT', 'AFTER_DEADLINE', 'NEVER']) feedbackRelease!: string;
  @ApiPropertyOptional() @IsOptional() @IsISO8601() deadline?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(480) timeLimitMinutes?: number;
  @ApiProperty({ type: [QuestionDto] })
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => QuestionDto)
  questions!: QuestionDto[];
}
export class CriterionDto {
  @ApiProperty() @IsString() @MaxLength(80) id!: string;
  @ApiProperty() @IsString() @MaxLength(150) title!: string;
  @ApiProperty() @IsString() @MaxLength(1000) description!: string;
  @ApiProperty() @IsInt() @Min(1) @Max(100) maxPoints!: number;
}
export class RubricDto {
  @ApiProperty({ type: [CriterionDto] })
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => CriterionDto)
  criteria!: CriterionDto[];
  @ApiProperty() @IsInt() @Min(1) @Max(100) passPercent!: number;
  @ApiPropertyOptional() @IsOptional() @IsISO8601() deadline?: string;
}
@ValidatorConstraint({ name: 'resourceContent', async: false })
class ResourceContentConstraint implements ValidatorConstraintInterface {
  validate(_title: unknown, arguments_: ValidationArguments) {
    const resource = arguments_.object as ResourceDto;
    const hasText = typeof resource.text === 'string' && resource.text.trim().length > 0;
    const hasUrl = typeof resource.url === 'string' && resource.url.trim().length > 0;
    return (
      typeof _title === 'string' &&
      _title.trim().length > 0 &&
      (hasText || hasUrl) &&
      (!resource.offlineAllowed || hasText)
    );
  }

  defaultMessage() {
    return 'A resource needs a title and readable text or an HTTPS link. Offline resources need pasted text.';
  }
}

export class ResourceDto {
  @ApiProperty() @IsString() @MaxLength(200) @Validate(ResourceContentConstraint) title!: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2000)
  url?: string;
  @ApiPropertyOptional({ maxLength: 50000 })
  @IsOptional()
  @IsString()
  @MaxLength(50000)
  text?: string;
  @ApiProperty() @IsBoolean() accessible!: boolean;
  @ApiProperty() @IsBoolean() offlineAllowed!: boolean;
}
export class AccessibilityDto {
  @ApiProperty() @IsBoolean() imagesHaveAlt!: boolean;
  @ApiProperty() @IsBoolean() resourcesReviewed!: boolean;
  @ApiProperty() @IsBoolean() headingsReviewed!: boolean;
}
export class ActivityDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) id?: string;
  @ApiProperty() @IsString() @MaxLength(200) title!: string;
  @ApiProperty() @IsIn(['LESSON', 'PRACTICE', 'ASSIGNMENT']) kind!:
    'LESSON' | 'PRACTICE' | 'ASSIGNMENT';
  @ApiProperty() @IsString() @MaxLength(2000) objective!: string;
  @ApiProperty() @IsString() @MaxLength(50000) body!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(10000) example = '';
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(3000) reflection = '';
  @ApiProperty() @IsInt() @Min(1) @Max(600) estimatedMinutes!: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  videoUrl?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  captionsUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50000) transcript?: string;
  @ApiProperty({ type: [ResourceDto] })
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ResourceDto)
  resources!: ResourceDto[];
  @ApiProperty({ type: AccessibilityDto })
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => AccessibilityDto)
  accessibility!: AccessibilityDto;
  @ApiProperty() @IsString() @MaxLength(500) rights!: string;
  @ApiProperty() @IsBoolean() offlineAllowed!: boolean;
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  prerequisiteIds!: string[];
  @ApiPropertyOptional({ type: AssessmentDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AssessmentDto)
  assessment?: AssessmentDto;
  @ApiPropertyOptional({ type: RubricDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => RubricDto)
  rubric?: RubricDto;
}
export class ModuleDto {
  @ApiProperty() @IsString() @MaxLength(200) title!: string;
  @ApiProperty({ type: [ActivityDto] })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ActivityDto)
  activities!: ActivityDto[];
}
export class OutlineDto {
  @ApiProperty({ type: String, nullable: true })
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  @MaxLength(100)
  expectedVersionId!: string | null;
  @ApiProperty({ minimum: 0 }) @IsInt() @Min(0) @Max(2147483646) expectedRevision!: number;
  @ApiProperty() @IsString() @MaxLength(150) title!: string;
  @ApiProperty() @IsString() @MaxLength(5000) description!: string;
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(1000, { each: true })
  outcomes!: string[];
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(1000, { each: true })
  prerequisites!: string[];
  @ApiProperty() @IsString() @MaxLength(1000) completionRule!: string;
  @ApiProperty({ type: [ModuleDto] })
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ModuleDto)
  modules!: ModuleDto[];
}
