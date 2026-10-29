import { Global, Module } from '@nestjs/common';
import { CoursePolicy } from './course.policy';
import { CoursesController } from './courses.controller';
import { CoursesService } from './courses.service';
@Global()
@Module({
  controllers: [CoursesController],
  providers: [CoursePolicy, CoursesService],
  exports: [CoursePolicy, CoursesService],
})
export class CoursesModule {}
