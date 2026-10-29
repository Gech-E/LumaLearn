import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CourseReportResponse } from '../courses/responses.dto';
import { AuthRequest } from '../auth/auth.decorators';
import { ReportingService } from './reporting.service';
import { PaginationDto } from '../http/pagination.dto';

@ApiTags('Reporting')
@Controller('reporting')
export class ReportingController {
  constructor(private service: ReportingService) {}
  @ApiOkResponse({ type: CourseReportResponse }) @Get('courses/:id') course(
    @Req() r: AuthRequest,
    @Param('id') id: string,
    @Query() pagination: PaginationDto,
  ) {
    return this.service.course(r.user, id, pagination);
  }
}
