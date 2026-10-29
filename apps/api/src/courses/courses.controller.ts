import { Body, Controller, Get, Param, Post, Put, Query, Req } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/auth.decorators';
import { CatalogQuery, CreateCourseDto, OutlineDto } from './courses.dto';
import { CoursesService } from './courses.service';
import {
  AssignedCoursesResponse,
  CourseCatalogResponse,
  CourseDetailResponse,
  CourseEditorResponse,
  CourseStateResponse,
  PublicationResponse,
  PublicationReviewResponse,
  StateResponse,
} from './responses.dto';
@ApiTags('Courses')
@Controller('courses')
export class CoursesController {
  constructor(private service: CoursesService) {}
  @ApiOkResponse({ type: CourseCatalogResponse }) @Public() @Get() catalog(
    @Query() q: CatalogQuery,
  ) {
    return this.service.catalog(q);
  }
  @ApiOkResponse({ type: AssignedCoursesResponse }) @Get('assigned') assigned(@Req() req: any) {
    return this.service.assigned(req.user);
  }
  @ApiCreatedResponse({ type: CourseStateResponse }) @Post() create(
    @Req() req: any,
    @Body() dto: CreateCourseDto,
  ) {
    return this.service.create(req.user, dto);
  }
  @ApiOkResponse({ type: CourseEditorResponse }) @Get(':id/editor') editor(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    return this.service.editor(req.user, id);
  }
  @ApiOkResponse({ type: CourseEditorResponse }) @Put(':id/outline') save(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: OutlineDto,
  ) {
    return this.service.save(req.user, id, dto);
  }
  @ApiOkResponse({ type: PublicationReviewResponse }) @Get(':id/review') review(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    return this.service.review(req.user, id);
  }
  @ApiCreatedResponse({ type: StateResponse }) @Post(':id/review') submitReview(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    return this.service.state(req.user, id, 'REVIEW');
  }
  @ApiCreatedResponse({ type: PublicationResponse }) @Post(':id/publish') publish(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    return this.service.publish(req.user, id);
  }
  @ApiCreatedResponse({ type: StateResponse }) @Post(':id/archive') archive(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    return this.service.state(req.user, id, 'ARCHIVED');
  }
  @ApiOkResponse({ type: CourseDetailResponse }) @Public() @Get(':id') detail(
    @Param('id') id: string,
  ) {
    return this.service.detail(id);
  }
}
