import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuthRequest, Roles } from '../auth/auth.decorators';
import { PageDto } from '../users/users.dto';
import {
  CreateSupportDto,
  RespondSupportDto,
  SupportPageDto,
  SupportTicketDto,
} from './support.dto';
import { SupportService } from './support.service';

@ApiTags('Support')
@Controller('support')
export class SupportController {
  constructor(private readonly support: SupportService) {}
  @Get() @ApiOkResponse({ type: SupportPageDto }) list(
    @Req() req: AuthRequest,
    @Query() query: PageDto,
  ) {
    return this.support.list(req.user, query);
  }
  @Post() @ApiCreatedResponse({ type: SupportTicketDto }) create(
    @Req() req: AuthRequest,
    @Body() body: CreateSupportDto,
  ) {
    return this.support.create(req.user, body);
  }
  @Roles('SUPPORT', 'ADMIN') @Patch(':id') @ApiOkResponse({ type: SupportTicketDto }) respond(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: RespondSupportDto,
  ) {
    return this.support.respond(req.user, id, body);
  }
}
