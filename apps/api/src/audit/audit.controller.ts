import { Controller, Get, Query, Req } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuthRequest, Roles } from '../auth/auth.decorators';
import { PageDto } from '../users/users.dto';
import { AuditPageDto } from './audit.dto';
import { AuditService } from './audit.service';

@ApiTags('Audit')
@Roles('ADMIN')
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}
  @Get() @ApiOkResponse({ type: AuditPageDto }) list(
    @Req() req: AuthRequest,
    @Query() query: PageDto,
  ) {
    return this.audit.list(req.user, query);
  }
}
