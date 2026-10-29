import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/auth.decorators';
import { HealthDto, ReadinessDto } from './health.dto';
import { HealthService } from './health.service';

@ApiTags('Health')
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  @ApiOkResponse({ type: HealthDto })
  live() {
    return { status: 'ok' };
  }

  @Get('ready')
  @ApiOkResponse({ type: ReadinessDto })
  ready() {
    return this.health.ready();
  }
}
