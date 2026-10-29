import { ApiProperty } from '@nestjs/swagger';
import { AssetStatus } from '@prisma/client';
export class AssetDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() mime!: string;
  @ApiProperty() size!: number;
  @ApiProperty({ enum: AssetStatus }) status!: AssetStatus;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
}
export class DownloadDto {
  @ApiProperty() url!: string;
  @ApiProperty() expiresIn!: number;
  @ApiProperty() name!: string;
}
