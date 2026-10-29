import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';
import { PageResponseDto } from '../users/users.dto';

export class NoticeDto {
  @ApiProperty() @IsString() @Length(2, 120) title!: string;
  @ApiProperty() @IsString() @Length(2, 3000) body!: string;
}
export class NotificationDto {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
  @ApiProperty() body!: string;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) readAt!: Date | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
}
export class NotificationPageDto extends PageResponseDto {
  @ApiProperty({ type: [NotificationDto] }) items!: NotificationDto[];
}
export class ReadNotificationDto {
  @ApiProperty() id!: string;
  @ApiProperty() read!: boolean;
}
export class PendingNoticeDto {
  @ApiProperty() id!: string;
  @ApiProperty() status!: string;
}
