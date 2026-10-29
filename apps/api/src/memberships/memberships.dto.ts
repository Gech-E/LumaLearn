import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PageResponseDto } from '../users/users.dto';
import { MembershipState, Role } from '@prisma/client';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsOptional,
} from 'class-validator';
export class MembershipUpdateDto {
  @ApiPropertyOptional({ enum: MembershipState })
  @IsOptional()
  @IsEnum(MembershipState)
  state?: MembershipState;
  @ApiPropertyOptional({ enum: Role, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @ArrayUnique()
  @IsEnum(Role, { each: true })
  roles?: Role[];
}
class MemberUserDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() email!: string;
}
export class MembershipResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() userId!: string;
  @ApiProperty({ enum: MembershipState }) state!: MembershipState;
  @ApiProperty({ enum: Role, isArray: true }) roles!: Role[];
  @ApiProperty({ type: MemberUserDto }) user!: MemberUserDto;
}
export class MembershipPageDto extends PageResponseDto {
  @ApiProperty({ type: [MembershipResponseDto] }) items!: MembershipResponseDto[];
}
export class MembershipChangedDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: MembershipState }) state!: MembershipState;
  @ApiProperty({ enum: Role, isArray: true }) roles!: Role[];
  @ApiProperty() message!: string;
}
