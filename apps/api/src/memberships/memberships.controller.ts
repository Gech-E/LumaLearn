import { Body, Controller, Get, Param, Patch, Query, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuthRequest, Roles } from '../auth/auth.decorators';
import { PageDto } from '../users/users.dto';
import { MembershipChangedDto, MembershipPageDto, MembershipUpdateDto } from './memberships.dto';
import { MembershipsService } from './memberships.service';
@ApiTags('Memberships')
@ApiCookieAuth()
@Roles('ADMIN')
@Controller('memberships')
export class MembershipsController {
  constructor(private readonly memberships: MembershipsService) {}
  @Get() @ApiOkResponse({ type: MembershipPageDto }) list(
    @Req() req: AuthRequest,
    @Query() query: PageDto,
  ) {
    return this.memberships.list(req.user, query);
  }
  @Patch(':id') @ApiOkResponse({ type: MembershipChangedDto }) update(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: MembershipUpdateDto,
  ) {
    return this.memberships.update(req.user, id, body);
  }
}
