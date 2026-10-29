import { Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuthRequest, Roles } from '../auth/auth.decorators';
import { PageDto } from '../users/users.dto';
import { JobPageDto, RetryDto } from './jobs.dto';
import { JobsService } from './jobs.service';

@ApiTags('Background jobs')
@Roles('ADMIN')
@Controller('jobs')
export class JobsController {
  constructor(private readonly jobs: JobsService) {}
  @Get() @ApiOkResponse({ type: JobPageDto }) list(
    @Req() req: AuthRequest,
    @Query() query: PageDto,
  ) {
    return this.jobs.list(req.user, query);
  }
  @Post(':id/retry') @ApiCreatedResponse({ type: RetryDto }) retry(
    @Req() req: AuthRequest,
    @Param('id') id: string,
  ) {
    return this.jobs.retry(req.user, id);
  }
}
