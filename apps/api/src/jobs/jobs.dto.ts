import { ApiProperty } from '@nestjs/swagger';

export class JobStatusDto {
  @ApiProperty() id!: string;
  @ApiProperty() type!: string;
  @ApiProperty() status!: string;
  @ApiProperty() attempts!: number;
  @ApiProperty({ nullable: true, type: String }) lastError!: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
}
export class JobPageDto {
  @ApiProperty({ type: [JobStatusDto] }) items!: JobStatusDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
}
export class RetryDto {
  @ApiProperty() id!: string;
  @ApiProperty() status!: string;
}
