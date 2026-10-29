import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AttemptResponse } from '../courses/responses.dto';
import { AuthRequest } from '../auth/auth.decorators';
import { AttemptSubmitDto } from './assessments.dto';
import { AssessmentsService } from './assessments.service';

@ApiTags('Assessments')
@Controller('assessments')
export class AssessmentsController {
  constructor(private service: AssessmentsService) {}
  @ApiCreatedResponse({ type: AttemptResponse }) @Post(':activityId/attempts') start(
    @Req() r: AuthRequest,
    @Param('activityId') id: string,
  ) {
    return this.service.start(r.user, id);
  }
  @ApiOkResponse({ type: AttemptResponse }) @Get('attempts/:id') get(
    @Req() r: AuthRequest,
    @Param('id') id: string,
  ) {
    return this.service.get(r.user, id);
  }
  @ApiCreatedResponse({ type: AttemptResponse }) @Post('attempts/:id/submit') submit(
    @Req() r: AuthRequest,
    @Param('id') id: string,
    @Body() d: AttemptSubmitDto,
  ) {
    return this.service.submit(r.user, id, d);
  }
}
