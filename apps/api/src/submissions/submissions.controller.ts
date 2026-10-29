import { Body, Controller, Get, Param, Post, Put, Req } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { SubmissionResponse, SubmissionReceiptResponse } from '../courses/responses.dto';
import { AuthRequest } from '../auth/auth.decorators';
import { DraftDto, SubmitDto } from './submissions.dto';
import { SubmissionsService } from './submissions.service';

@ApiTags('Submissions')
@Controller('submissions')
export class SubmissionsController {
  constructor(private service: SubmissionsService) {}
  @ApiOkResponse({ type: SubmissionResponse }) @Get(':activityId') get(
    @Req() r: AuthRequest,
    @Param('activityId') id: string,
  ) {
    return this.service.get(r.user, id);
  }
  @ApiOkResponse({ type: SubmissionResponse }) @Put(':activityId') draft(
    @Req() r: AuthRequest,
    @Param('activityId') id: string,
    @Body() d: DraftDto,
  ) {
    return this.service.draft(r.user, id, d);
  }
  @ApiCreatedResponse({ type: SubmissionReceiptResponse }) @Post(':activityId/submit') submit(
    @Req() r: AuthRequest,
    @Param('activityId') id: string,
    @Body() d: SubmitDto,
  ) {
    return this.service.submit(r.user, id, d);
  }
}
