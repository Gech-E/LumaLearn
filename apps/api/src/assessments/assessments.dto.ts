import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsString,
  MaxLength,
  Validate,
  ValidateNested,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { Type } from 'class-transformer';

@ValidatorConstraint({ name: 'answer', async: false })
class AnswerValidator implements ValidatorConstraintInterface {
  validate(v: unknown) {
    return typeof v === 'string'
      ? v.length <= 5000
      : Array.isArray(v) &&
          v.length <= 12 &&
          v.every((x) => typeof x === 'string' && x.length <= 5000) &&
          new Set(v).size === v.length;
  }
  defaultMessage() {
    return 'Answer must be text or up to 12 unique text choices';
  }
}
export class ResponseDto {
  @ApiProperty() @IsString() @MaxLength(100) questionId!: string;
  @ApiProperty({ oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] })
  @Validate(AnswerValidator)
  answer!: string | string[];
}
export class AttemptSubmitDto {
  @ApiProperty({ type: [ResponseDto] })
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ResponseDto)
  responses!: ResponseDto[];
}
