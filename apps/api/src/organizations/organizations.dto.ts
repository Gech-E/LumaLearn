import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class OrganizationDto {
  @ApiProperty() @IsString() @Length(2, 100) name!: string;
}
export class OrganizationResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
}
