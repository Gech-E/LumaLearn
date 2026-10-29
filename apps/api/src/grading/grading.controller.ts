import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  GradingListResponse,
  GradingSubmissionResponse,
  GradeResponse,
} from '../courses/responses.dto';
import { AuthRequest } from '../auth/auth.decorators';
import { GradeDto, GradingQuery } from './grading.dto';
import { GradingService } from './grading.service';

@ApiTags('Grading')
@Controller('grading')
export class GradingController {
  constructor(private service: GradingService) {}
  @ApiOkResponse({ type: GradingListResponse }) @Get('submissions') list(
    @Req() r: AuthRequest,
    @Query() q: GradingQuery,
  ) {
    return this.service.list(r.user, q);
  }
  @ApiOkResponse({ type: GradingSubmissionResponse }) @Get('submissions/:id') get(
    @Req() r: AuthRequest,
    @Param('id') id: string,
  ) {
    return this.service.get(r.user, id);
  }
  @ApiCreatedResponse({ type: GradeResponse }) @Post('submissions/:id/grades') grade(
    @Req() r: AuthRequest,
    @Param('id') id: string,
    @Body() d: GradeDto,
  ) {
    return this.service.grade(r.user, id, d);
  }
  @ApiCreatedResponse({ type: GradeResponse }) @Post('grades/:id/release') release(
    @Req() r: AuthRequest,
    @Param('id') id: string,
  ) {
    return this.service.release(r.user, id);
  }
}
