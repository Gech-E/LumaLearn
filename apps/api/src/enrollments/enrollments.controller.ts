import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  EnrollmentResponse,
  EnrollmentListResponse,
  InvitationResponse,
  InvitationListResponse,
  UpdatedResponse,
} from '../courses/responses.dto';
import { AuthRequest } from '../auth/auth.decorators';
import {
  AccommodationDto,
  AssignDto,
  EnrollDto,
  InviteDto,
  BulkAssignDto,
  BulkEnrollmentPreview,
  BulkEnrollmentResult,
} from './enrollments.dto';
import { EnrollmentsService } from './enrollments.service';
import { PaginationDto } from '../http/pagination.dto';

@ApiTags('Enrollments')
@Controller('enrollments')
export class EnrollmentsController {
  constructor(private service: EnrollmentsService) {}
  @ApiCreatedResponse({ type: EnrollmentResponse }) @Post() enroll(
    @Req() r: AuthRequest,
    @Body() d: EnrollDto,
  ) {
    return this.service.enroll(r.user, d);
  }
  @ApiOkResponse({ type: EnrollmentListResponse }) @Get('course/:id') list(
    @Req() r: AuthRequest,
    @Param('id') id: string,
    @Query() pagination: PaginationDto,
  ) {
    return this.service.list(r.user, id, pagination);
  }
  @ApiCreatedResponse({ type: EnrollmentResponse }) @Post('course/:id/assign') assign(
    @Req() r: AuthRequest,
    @Param('id') id: string,
    @Body() d: AssignDto,
  ) {
    return this.service.assign(r.user, id, d);
  }
  @ApiCreatedResponse({ type: BulkEnrollmentPreview }) @Post('course/:id/bulk/preview') previewBulk(
    @Req() r: AuthRequest,
    @Param('id') id: string,
    @Body() d: BulkAssignDto,
  ) {
    return this.service.previewBulk(r.user, id, d);
  }
  @ApiCreatedResponse({ type: BulkEnrollmentResult }) @Post('course/:id/bulk/assign') assignBulk(
    @Req() r: AuthRequest,
    @Param('id') id: string,
    @Body() d: BulkAssignDto,
  ) {
    return this.service.assignBulk(r.user, id, d);
  }
  @ApiCreatedResponse({ type: InvitationResponse }) @Post('course/:id/invite') invite(
    @Req() r: AuthRequest,
    @Param('id') id: string,
    @Body() d: InviteDto,
  ) {
    return this.service.invite(r.user, id, d);
  }
  @ApiOkResponse({ type: InvitationListResponse }) @Get('course/:id/invitations') invitations(
    @Req() r: AuthRequest,
    @Param('id') id: string,
    @Query() pagination: PaginationDto,
  ) {
    return this.service.invitations(r.user, id, pagination);
  }
  @ApiOkResponse({ type: UpdatedResponse }) @Delete('invitations/:id') revokeInvitation(
    @Req() r: AuthRequest,
    @Param('id') id: string,
  ) {
    return this.service.revokeInvitation(r.user, id);
  }
  @ApiOkResponse({ type: UpdatedResponse }) @Patch(':id/accommodations') accommodate(
    @Req() r: AuthRequest,
    @Param('id') id: string,
    @Body() d: AccommodationDto,
  ) {
    return this.service.accommodate(r.user, id, d);
  }
}
