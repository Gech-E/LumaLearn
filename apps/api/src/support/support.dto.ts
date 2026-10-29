import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { PageResponseDto } from '../users/users.dto';

export class CreateSupportDto {
  @ApiPropertyOptional({ enum: ['HELP', 'EXPORT', 'DELETION'], default: 'HELP' })
  @IsOptional()
  @IsIn(['HELP', 'EXPORT', 'DELETION'])
  kind?: 'HELP' | 'EXPORT' | 'DELETION';
  @ApiProperty() @IsString() @Length(3, 150) subject!: string;
  @ApiProperty() @IsString() @Length(5, 5000) message!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) activityId?: string;
}
export class RespondSupportDto {
  @ApiProperty({ enum: ['OPEN', 'IN_PROGRESS', 'RESOLVED'] })
  @IsIn(['OPEN', 'IN_PROGRESS', 'RESOLVED'])
  status!: string;
  @ApiProperty() @IsString() @Length(3, 5000) response!: string;
}
export class SupportTicketDto {
  @ApiProperty() id!: string;
  @ApiProperty() userId!: string;
  @ApiProperty({ enum: ['HELP', 'EXPORT', 'DELETION'] }) kind!: string;
  @ApiProperty({ nullable: true, type: String }) activityId!: string | null;
  @ApiProperty() subject!: string;
  @ApiProperty() message!: string;
  @ApiProperty() status!: string;
  @ApiProperty({ nullable: true, type: String }) response!: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
}
export class SupportPageDto extends PageResponseDto {
  @ApiProperty({ type: [SupportTicketDto] }) items!: SupportTicketDto[];
}
