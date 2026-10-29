import { Body, Controller, Get, Patch, Query, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AllowSetup, AuthRequest, Roles } from '../auth/auth.decorators';
import { PageDto, ProfileDto, ProfileResponseDto, UserPageDto } from './users.dto';
import { UsersService } from './users.service';
@ApiTags('Users')
@ApiCookieAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}
  @AllowSetup() @Get('me') @ApiOkResponse({ type: ProfileResponseDto }) me(
    @Req() req: AuthRequest,
  ) {
    return this.users.me(req.user);
  }
  @AllowSetup() @Patch('me') @ApiOkResponse({ type: ProfileResponseDto }) update(
    @Req() req: AuthRequest,
    @Body() body: ProfileDto,
  ) {
    return this.users.update(req.user, body);
  }
  @Roles('ADMIN') @Get() @ApiOkResponse({ type: UserPageDto }) list(
    @Req() req: AuthRequest,
    @Query() query: PageDto,
  ) {
    return this.users.list(req.user, query);
  }
}
