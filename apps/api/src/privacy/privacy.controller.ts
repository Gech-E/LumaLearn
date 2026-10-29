import { Controller, Get, Query, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthRequest } from '../auth/auth.decorators';
import { PaginationDto } from '../http/pagination.dto';
import { PrivacyExportDto } from './privacy.dto';
import { PrivacyService } from './privacy.service';

@ApiTags('Privacy')
@ApiCookieAuth()
@Controller('users/me')
export class PrivacyController {
  constructor(private readonly privacy: PrivacyService) {}

  @Get('export')
  @ApiOperation({
    summary:
      'Export your own data in the current organization; maximum 100 records per collection per page.',
  })
  @ApiOkResponse({ type: PrivacyExportDto })
  export(@Req() req: AuthRequest, @Query() query: PaginationDto) {
    return this.privacy.exportOwnData(req.user, query);
  }
}
