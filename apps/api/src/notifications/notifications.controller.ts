import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuthRequest, Roles } from '../auth/auth.decorators';
import { PageDto } from '../users/users.dto';
import {
  NoticeDto,
  NotificationPageDto,
  ReadNotificationDto,
  PendingNoticeDto,
} from './notifications.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('Notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}
  @Get() @ApiOkResponse({ type: NotificationPageDto }) list(
    @Req() req: AuthRequest,
    @Query() query: PageDto,
  ) {
    return this.notifications.list(req.user, query);
  }
  @Patch(':id/read') @ApiOkResponse({ type: ReadNotificationDto }) read(
    @Req() req: AuthRequest,
    @Param('id') id: string,
  ) {
    return this.notifications.read(req.user, id);
  }
  @Roles('ADMIN') @Post('notices') @ApiCreatedResponse({ type: PendingNoticeDto }) notice(
    @Req() req: AuthRequest,
    @Body() body: NoticeDto,
  ) {
    return this.notifications.notice(req.user, body);
  }
}
