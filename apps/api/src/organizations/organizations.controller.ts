import { Body, Controller, Get, Patch, Req } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuthRequest, Roles } from '../auth/auth.decorators';
import { OrganizationDto, OrganizationResponseDto } from './organizations.dto';
import { OrganizationsService } from './organizations.service';

@ApiTags('Organizations')
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}
  @Get('current') @ApiOkResponse({ type: OrganizationResponseDto }) get(@Req() req: AuthRequest) {
    return this.organizations.get(req.user);
  }
  @Roles('ADMIN') @Patch('current') @ApiOkResponse({ type: OrganizationResponseDto }) update(
    @Req() req: AuthRequest,
    @Body() body: OrganizationDto,
  ) {
    return this.organizations.update(req.user, body.name);
  }
}
