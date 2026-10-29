import { CoursesModule } from './courses/courses.module';
import { EnrollmentsModule } from './enrollments/enrollments.module';
import { LearningModule } from './learning/learning.module';
import { AssessmentsModule } from './assessments/assessments.module';
import { SubmissionsModule } from './submissions/submissions.module';
import { GradingModule } from './grading/grading.module';
import { ReportingModule } from './reporting/reporting.module';
export const learningModules = [
  CoursesModule,
  EnrollmentsModule,
  LearningModule,
  AssessmentsModule,
  SubmissionsModule,
  GradingModule,
  ReportingModule,
];
