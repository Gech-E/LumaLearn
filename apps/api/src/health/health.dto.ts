import { ApiProperty } from '@nestjs/swagger';

export class HealthDto {
  @ApiProperty() status!: string;
}

export class ReadinessDto extends HealthDto {
  @ApiProperty({ type: 'object', additionalProperties: { type: 'boolean' } })
  dependencies!: Record<string, boolean>;
}
