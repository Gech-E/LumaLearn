import { ApiProperty } from '@nestjs/swagger';
import { PageResponseDto } from '../users/users.dto';

export class AuditEventDto {
  @ApiProperty() id!: string;
  @ApiProperty() actorId!: string;
  @ApiProperty() action!: string;
  @ApiProperty() objectId!: string;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
}
export class AuditPageDto extends PageResponseDto {
  @ApiProperty({ type: [AuditEventDto] }) items!: AuditEventDto[];
}
