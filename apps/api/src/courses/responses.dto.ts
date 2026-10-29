import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ActivityDto, CriterionDto, ResourceDto } from './courses.dto';
import { PaginationResponseDto } from '../http/pagination.dto';

export class CourseCardResponse {
  @ApiProperty() id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() title!: string;
  @ApiProperty() summary!: string;
  @ApiProperty() subject!: string;
  @ApiProperty() level!: string;
  @ApiProperty() language!: string;
  @ApiProperty() format!: string;
  @ApiProperty() instructorName!: string;
  @ApiProperty() effortMinutes!: number;
}
export class CourseStateResponse extends CourseCardResponse {
  @ApiProperty({ enum: ['DRAFT', 'REVIEW', 'PUBLISHED', 'ARCHIVED'] }) state!: string;
  @ApiPropertyOptional() enrollmentCount?: number;
}
export class CourseCatalogResponse {
  @ApiProperty({ type: [CourseCardResponse] }) items!: CourseCardResponse[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
}
export class AssignedCoursesResponse {
  @ApiProperty({ type: [CourseStateResponse] }) items!: CourseStateResponse[];
}
export class OutlineActivityResponse {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ enum: ['LESSON', 'PRACTICE', 'ASSIGNMENT'] }) kind!: string;
  @ApiProperty() estimatedMinutes!: number;
  @ApiProperty({ type: [String] }) prerequisiteIds!: string[];
}
export class OutlineModuleResponse {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
  @ApiProperty() position!: number;
  @ApiProperty({ type: [OutlineActivityResponse] }) activities!: OutlineActivityResponse[];
}
export class CourseVersionResponse {
  @ApiProperty() id!: string;
  @ApiProperty() number!: number;
  @ApiProperty() title!: string;
  @ApiProperty() description!: string;
  @ApiProperty({ type: [String] }) outcomes!: string[];
  @ApiProperty({ type: [String] }) prerequisites!: string[];
  @ApiProperty() completionRule!: string;
  @ApiProperty({ type: [OutlineModuleResponse] }) modules!: OutlineModuleResponse[];
}
export class CourseDetailResponse extends CourseCardResponse {
  @ApiProperty() freeEnrollment!: boolean;
  @ApiProperty({ type: CourseVersionResponse }) version!: CourseVersionResponse;
}
export class EditorModuleResponse {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ type: [ActivityDto] }) activities!: ActivityDto[];
}
export class EditorVersionResponse {
  @ApiProperty() id!: string;
  @ApiProperty() number!: number;
  @ApiProperty() revision!: number;
  @ApiProperty() state!: string;
  @ApiProperty() title!: string;
  @ApiProperty() description!: string;
  @ApiProperty({ type: [String] }) outcomes!: string[];
  @ApiProperty({ type: [String] }) prerequisites!: string[];
  @ApiProperty() completionRule!: string;
  @ApiProperty({ type: [EditorModuleResponse] }) modules!: EditorModuleResponse[];
}
export class VersionSummaryResponse {
  @ApiProperty() id!: string;
  @ApiProperty() number!: number;
  @ApiProperty() revision!: number;
  @ApiProperty() state!: string;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) publishedAt!: string | null;
}
export class CourseEditorResponse {
  @ApiProperty({ type: CourseStateResponse }) course!: CourseStateResponse;
  @ApiProperty({ type: EditorVersionResponse, nullable: true })
  version!: EditorVersionResponse | null;
  @ApiProperty({ type: [VersionSummaryResponse] }) versions!: VersionSummaryResponse[];
}
export class PublicationReviewResponse {
  @ApiProperty() versionId!: string;
  @ApiProperty() state!: string;
  @ApiProperty() canPublish!: boolean;
  @ApiProperty({ type: [String] }) issues!: string[];
  @ApiProperty() completionPreview!: string;
}
export class PublicationResponse {
  @ApiProperty() id!: string;
  @ApiProperty() versionId!: string;
  @ApiProperty() state!: string;
}
export class StateResponse {
  @ApiProperty() id!: string;
  @ApiProperty() state!: string;
}
export class UpdatedResponse {
  @ApiProperty() id!: string;
  @ApiProperty() updated!: boolean;
}
export class EnrollmentResponse extends StateResponse {
  @ApiProperty() courseId!: string;
}
export class PersonResponse {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() email!: string;
}
export class EnrollmentMemberResponse extends StateResponse {
  @ApiProperty({ type: PersonResponse }) user!: PersonResponse;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) deadlineExtension!:
    string | null;
  @ApiProperty() extraAttempts!: number;
  @ApiProperty() extraTimeMinutes!: number;
}
export class EnrollmentListResponse extends PaginationResponseDto {
  @ApiProperty({ type: [EnrollmentMemberResponse] }) items!: EnrollmentMemberResponse[];
}
export class InvitationResponse {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ format: 'date-time' }) expiresAt!: string;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) acceptedAt!: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) revokedAt!: string | null;
}
export class InvitationListResponse extends PaginationResponseDto {
  @ApiProperty({ type: [InvitationResponse] }) items!: InvitationResponse[];
}
export class NextActivityResponse {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
  @ApiProperty() kind!: string;
}
export class ProgressSummaryResponse {
  @ApiProperty() progress!: number;
  @ApiProperty({ type: NextActivityResponse, nullable: true })
  nextActivity!: NextActivityResponse | null;
}
export class HomeCourseResponse extends ProgressSummaryResponse {
  @ApiProperty() id!: string;
  @ApiProperty() state!: string;
  @ApiProperty({ type: CourseCardResponse }) course!: CourseCardResponse;
}
export class HomeFeedbackResponse {
  @ApiProperty() id!: string;
  @ApiProperty() score!: number;
  @ApiProperty() feedback!: string;
  @ApiProperty() activityTitle!: string;
  @ApiProperty() courseTitle!: string;
  @ApiProperty() activityId!: string;
  @ApiProperty({ format: 'date-time' }) releasedAt!: string;
}
export class LearningHomeResponse {
  @ApiProperty({ type: [HomeCourseResponse] }) items!: HomeCourseResponse[];
  @ApiProperty({ type: [HomeFeedbackResponse] }) feedback!: HomeFeedbackResponse[];
}
export class CompletionResponse {
  @ApiProperty() activityId!: string;
  @ApiProperty({ enum: ['VIEWED', 'COMPLETED', 'PASSED'] }) state!: string;
}
export class LearningCourseResponse extends ProgressSummaryResponse {
  @ApiProperty({ type: CourseCardResponse }) course!: CourseCardResponse;
  @ApiProperty({ type: CourseVersionResponse }) version!: CourseVersionResponse;
  @ApiProperty({ type: StateResponse }) enrollment!: StateResponse;
  @ApiProperty({ type: [CompletionResponse] }) completions!: CompletionResponse[];
}
export class AssessmentRulesResponse {
  @ApiProperty() maxAttempts!: number;
  @ApiProperty() passPercent!: number;
  @ApiProperty() feedbackRelease!: string;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) deadline!: string | null;
  @ApiProperty({ type: Number, nullable: true }) timeLimitMinutes!: number | null;
}
export class RubricResponse {
  @ApiProperty({ type: [CriterionDto] }) criteria!: CriterionDto[];
  @ApiProperty() passPercent!: number;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) deadline!: string | null;
}
export class LessonResponse {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ enum: ['LESSON', 'PRACTICE', 'ASSIGNMENT'] }) kind!: string;
  @ApiProperty() objective!: string;
  @ApiProperty() body!: string;
  @ApiProperty() example!: string;
  @ApiProperty() reflection!: string;
  @ApiProperty() estimatedMinutes!: number;
  @ApiProperty({ type: String, nullable: true }) videoUrl!: string | null;
  @ApiProperty({ type: String, nullable: true }) captionsUrl!: string | null;
  @ApiProperty({ type: String, nullable: true }) transcript!: string | null;
  @ApiProperty({ type: [ResourceDto] }) resources!: ResourceDto[];
  @ApiProperty() offlineAllowed!: boolean;
  @ApiProperty() courseId!: string;
  @ApiProperty() courseTitle!: string;
  @ApiProperty() versionId!: string;
  @ApiProperty({ type: [OutlineModuleResponse] }) outline!: OutlineModuleResponse[];
  @ApiProperty({ type: String, nullable: true }) previousId!: string | null;
  @ApiProperty({ type: String, nullable: true }) nextId!: string | null;
  @ApiProperty({ type: String, nullable: true }) completion!: string | null;
  @ApiProperty({ type: AssessmentRulesResponse, nullable: true })
  assessment!: AssessmentRulesResponse | null;
  @ApiProperty({ type: RubricResponse, nullable: true }) rubric!: RubricResponse | null;
}
export class LessonDownloadResponse extends LessonResponse {
  @ApiProperty({ format: 'date-time' }) downloadedAt!: string;
  @ApiProperty({ format: 'date-time' }) expiresAt!: string;
  @ApiProperty() sizeBytes!: number;
}
export class ProgressAcknowledgmentResponse {
  @ApiProperty() acknowledged!: string;
  @ApiProperty({ enum: ['VIEWED', 'COMPLETED', 'PASSED'] }) state!: string;
}
export class AttemptQuestionResponse {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ['SINGLE', 'MULTIPLE', 'SHORT_TEXT'] }) kind!: string;
  @ApiProperty() prompt!: string;
  @ApiProperty({ type: [String] }) options!: string[];
  @ApiProperty() points!: number;
}
export class AttemptFeedbackResponse {
  @ApiProperty() questionId!: string;
  @ApiProperty() correct!: boolean;
  @ApiProperty({ type: [String] }) answer!: string[];
  @ApiProperty() explanation!: string;
}
export class AttemptResponse {
  @ApiProperty() id!: string;
  @ApiProperty() number!: number;
  @ApiProperty({ enum: ['STARTED', 'SUBMITTED'] }) state!: string;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) expiresAt!: string | null;
  @ApiProperty({ type: Number, nullable: true }) score!: number | null;
  @ApiProperty({ type: Boolean, nullable: true }) passed!: boolean | null;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) submittedAt!: string | null;
  @ApiProperty({ type: [AttemptQuestionResponse] }) questions!: AttemptQuestionResponse[];
  @ApiProperty({ type: [AttemptFeedbackResponse], nullable: true }) feedback!:
    AttemptFeedbackResponse[] | null;
}
export class CriterionScoreResponse {
  @ApiProperty() criterionId!: string;
  @ApiProperty() points!: number;
}
export class GradeResponse {
  @ApiProperty() id!: string;
  @ApiProperty() revision!: number;
  @ApiProperty() submissionRevision!: number;
  @ApiProperty({ type: [CriterionScoreResponse] }) criteriaScores!: CriterionScoreResponse[];
  @ApiProperty() score!: number;
  @ApiProperty() passed!: boolean;
  @ApiProperty() feedback!: string;
  @ApiProperty() revisionRequested!: boolean;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) releasedAt!: string | null;
  @ApiPropertyOptional({ format: 'date-time' }) createdAt?: string;
}
export class SubmissionResponse {
  @ApiProperty({ type: String, nullable: true }) id!: string | null;
  @ApiProperty({ enum: ['DRAFT', 'SUBMITTED', 'REVISION_REQUESTED'] }) state!: string;
  @ApiProperty() text!: string;
  @ApiProperty({ type: String, nullable: true }) link!: string | null;
  @ApiProperty({ type: [String] }) assetIds!: string[];
  @ApiProperty({ type: [CriterionDto] }) rubric!: CriterionDto[];
  @ApiProperty({ type: String, nullable: true }) receipt!: string | null;
  @ApiProperty() revision!: number;
  @ApiPropertyOptional({ type: String, nullable: true, format: 'date-time' }) submittedAt?:
    string | null;
  @ApiPropertyOptional({ format: 'date-time' }) updatedAt?: string;
  @ApiProperty({ type: [GradeResponse] }) grades!: GradeResponse[];
}
export class SubmissionReceiptResponse {
  @ApiProperty() id!: string;
  @ApiProperty() state!: string;
  @ApiProperty() receipt!: string;
  @ApiProperty() revision!: number;
  @ApiProperty({ format: 'date-time' }) submittedAt!: string;
}
export class GradingItemResponse {
  @ApiProperty() id!: string;
  @ApiProperty() activityId!: string;
  @ApiProperty() activityTitle!: string;
  @ApiProperty() courseId!: string;
  @ApiProperty() courseTitle!: string;
  @ApiProperty({ type: PersonResponse }) learner!: PersonResponse;
  @ApiProperty() state!: string;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) submittedAt!: string | null;
  @ApiProperty() revision!: number;
  @ApiProperty({ type: GradeResponse, nullable: true }) latestGrade!: GradeResponse | null;
}
export class GradingListResponse {
  @ApiProperty({ type: [GradingItemResponse] }) items!: GradingItemResponse[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
}
export class SubmissionSnapshotResponse {
  @ApiProperty() text!: string;
  @ApiProperty({ type: String, nullable: true }) link!: string | null;
  @ApiProperty({ type: [String] }) assetIds!: string[];
  @ApiProperty({ type: [CriterionDto] }) rubric!: CriterionDto[];
}
export class SubmissionHistoryResponse {
  @ApiProperty() revision!: number;
  @ApiProperty() receipt!: string;
  @ApiProperty({ type: SubmissionSnapshotResponse }) snapshot!: SubmissionSnapshotResponse;
  @ApiProperty({ format: 'date-time' }) submittedAt!: string;
}
export class GradingSubmissionResponse extends SubmissionResponse {
  @ApiProperty() activityId!: string;
  @ApiProperty() activityTitle!: string;
  @ApiProperty() courseTitle!: string;
  @ApiProperty({ type: PersonResponse }) learner!: PersonResponse;
  @ApiProperty({ type: [SubmissionHistoryResponse] }) history!: SubmissionHistoryResponse[];
}
export class ReleasedGradeSummaryResponse {
  @ApiProperty() score!: number;
  @ApiProperty() passed!: boolean;
  @ApiProperty({ format: 'date-time' }) releasedAt!: string;
}
export class LearnerReportResponse {
  @ApiProperty() enrollmentId!: string;
  @ApiProperty({ type: PersonResponse }) learner!: PersonResponse;
  @ApiProperty() state!: string;
  @ApiProperty() progress!: number;
  @ApiProperty() attempts!: number;
  @ApiProperty() practicesPassed!: number;
  @ApiProperty() submittedAssignments!: number;
  @ApiProperty({ type: [ReleasedGradeSummaryResponse] })
  releasedGrades!: ReleasedGradeSummaryResponse[];
}
export class ReportCourseResponse {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
}
export class CourseReportResponse {
  @ApiProperty({ type: ReportCourseResponse }) course!: ReportCourseResponse;
  @ApiProperty() total!: number;
  @ApiProperty() completed!: number;
  @ApiProperty({ type: [LearnerReportResponse] }) items!: LearnerReportResponse[];
  @ApiProperty() limit!: number;
  @ApiProperty() page!: number;
  @ApiProperty() notice!: string;
}
