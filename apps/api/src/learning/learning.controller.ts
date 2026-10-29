import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  LearningHomeResponse,
  LearningCourseResponse,
  LessonResponse,
  LessonDownloadResponse,
  ProgressAcknowledgmentResponse,
} from '../courses/responses.dto';
import { AuthRequest } from '../auth/auth.decorators';
import { ProgressDto } from './learning.dto';
import { LearningService } from './learning.service';

@ApiTags('Learning')
@Controller('learning')
export class LearningController {
  constructor(private service: LearningService) {}
  @ApiOkResponse({ type: LearningHomeResponse }) @Get('home') home(@Req() r: AuthRequest) {
    return this.service.home(r.user);
  }
  @ApiOkResponse({ type: LearningCourseResponse }) @Get('courses/:id') course(
    @Req() r: AuthRequest,
    @Param('id') id: string,
  ) {
    return this.service.course(r.user, id);
  }
  @ApiOkResponse({ type: LessonResponse }) @Get('activities/:id') activity(
    @Req() r: AuthRequest,
    @Param('id') id: string,
  ) {
    return this.service.activity(r.user, id);
  }
  @ApiOkResponse({ type: LessonDownloadResponse }) @Get('activities/:id/download') download(
    @Req() r: AuthRequest,
    @Param('id') id: string,
  ) {
    return this.service.download(r.user, id);
  }
  @ApiCreatedResponse({ type: ProgressAcknowledgmentResponse }) @Post('progress') progress(
    @Req() r: AuthRequest,
    @Body() d: ProgressDto,
  ) {
    return this.service.progress(r.user, d);
  }
}
