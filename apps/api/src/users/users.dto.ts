import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';
import { PaginationDto, PaginationResponseDto } from '../http/pagination.dto';
export class PageDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  q?: string;
}
export class ProfileDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(2, 100) name?: string;
  @ApiPropertyOptional({ example: 'Africa/Nairobi' })
  @IsOptional()
  @IsString()
  @Length(3, 100)
  timezone?: string;
  @ApiPropertyOptional({ enum: ['en', 'ti'] }) @IsOptional() @IsIn(['en', 'ti']) locale?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() reminders?: boolean;
  @ApiPropertyOptional({ example: '21:00' })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  quietStart?: string;
  @ApiPropertyOptional({ example: '08:00' })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  quietEnd?: string;
}
export class PageResponseDto extends PaginationResponseDto {}
export class ProfileResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty() name!: string;
  @ApiProperty() timezone!: string;
  @ApiProperty() locale!: string;
  @ApiProperty() reminders!: boolean;
  @ApiProperty() quietStart!: string;
  @ApiProperty() quietEnd!: string;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) verifiedAt!: Date | null;
  @ApiProperty({ type: [String] }) roles!: string[];
  @ApiProperty() organizationId!: string;
  @ApiProperty() membershipId!: string;
  @ApiProperty() mfaEnabled!: boolean;
}
export class ManagedUserDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() email!: string;
  @ApiProperty() verified!: boolean;
  @ApiProperty() membershipId!: string;
  @ApiProperty() state!: string;
  @ApiProperty({ type: [String] }) roles!: string[];
}
export class UserPageDto extends PageResponseDto {
  @ApiProperty({ type: [ManagedUserDto] }) items!: ManagedUserDto[];
}
