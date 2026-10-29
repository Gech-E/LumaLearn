import { ApiProperty } from '@nestjs/swagger';
import { PaginationResponseDto } from '../http/pagination.dto';

class ExportProfileDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty() name!: string;
  @ApiProperty() timezone!: string;
  @ApiProperty() locale!: string;
  @ApiProperty() reminders!: boolean;
  @ApiProperty() quietStart!: string;
  @ApiProperty() quietEnd!: string;
  @ApiProperty() verified!: boolean;
  @ApiProperty() mfaEnabled!: boolean;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
}
class ExportMembershipDto {
  @ApiProperty() id!: string;
  @ApiProperty() organizationId!: string;
  @ApiProperty() organizationName!: string;
  @ApiProperty() state!: string;
  @ApiProperty({ type: [String] }) roles!: string[];
}
class ExportEnrollmentDto {
  @ApiProperty() id!: string;
  @ApiProperty() courseId!: string;
  @ApiProperty() courseVersionId!: string;
  @ApiProperty() state!: string;
  @ApiProperty() source!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  deadlineExtension!: Date | null;
  @ApiProperty() extraAttempts!: number;
  @ApiProperty() extraTimeMinutes!: number;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
}
class ExportProgressDto {
  @ApiProperty() id!: string;
  @ApiProperty() enrollmentId!: string;
  @ApiProperty() activityId!: string;
  @ApiProperty() state!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) clientAt!: Date | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
}
class ExportSubmissionContentDto {
  @ApiProperty() text!: string;
  @ApiProperty({ type: String, nullable: true }) link!: string | null;
  @ApiProperty({ type: [String] }) assetIds!: string[];
}
class ExportReceiptDto {
  @ApiProperty() id!: string;
  @ApiProperty() submissionId!: string;
  @ApiProperty() receipt!: string;
  @ApiProperty() revision!: number;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ type: ExportSubmissionContentDto }) content!: ExportSubmissionContentDto;
}
class ExportCriterionScoreDto {
  @ApiProperty() criterionId!: string;
  @ApiProperty() points!: number;
}
class ExportGradeDto {
  @ApiProperty() id!: string;
  @ApiProperty() submissionId!: string;
  @ApiProperty() revision!: number;
  @ApiProperty() submissionRevision!: number;
  @ApiProperty({ type: [ExportCriterionScoreDto] }) criteriaScores!: ExportCriterionScoreDto[];
  @ApiProperty() score!: number;
  @ApiProperty() passed!: boolean;
  @ApiProperty() feedback!: string;
  @ApiProperty() revisionRequested!: boolean;
  @ApiProperty({ type: String, format: 'date-time' }) releasedAt!: Date;
}
class ExportSupportDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ['HELP', 'EXPORT', 'DELETION'] }) kind!: string;
  @ApiProperty() subject!: string;
  @ApiProperty() message!: string;
  @ApiProperty() status!: string;
  @ApiProperty({ type: String, nullable: true }) response!: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
}
class ExportEnrollmentPageDto extends PaginationResponseDto {
  @ApiProperty({ type: [ExportEnrollmentDto] }) items!: ExportEnrollmentDto[];
}
class ExportProgressPageDto extends PaginationResponseDto {
  @ApiProperty({ type: [ExportProgressDto] }) items!: ExportProgressDto[];
}
class ExportReceiptPageDto extends PaginationResponseDto {
  @ApiProperty({ type: [ExportReceiptDto] }) items!: ExportReceiptDto[];
}
class ExportGradePageDto extends PaginationResponseDto {
  @ApiProperty({ type: [ExportGradeDto] }) items!: ExportGradeDto[];
}
class ExportSupportPageDto extends PaginationResponseDto {
  @ApiProperty({ type: [ExportSupportDto] }) items!: ExportSupportDto[];
}
export class PrivacyExportDto {
  @ApiProperty({ example: 1 }) schemaVersion!: number;
  @ApiProperty({ type: String, format: 'date-time' }) generatedAt!: string;
  @ApiProperty({
    description: 'Current organization only. Each collection is paginated separately.',
  })
  scope!: string;
  @ApiProperty({ type: ExportProfileDto }) profile!: ExportProfileDto;
  @ApiProperty({ type: ExportMembershipDto }) membership!: ExportMembershipDto;
  @ApiProperty({ type: ExportEnrollmentPageDto }) enrollments!: ExportEnrollmentPageDto;
  @ApiProperty({ type: ExportProgressPageDto }) progress!: ExportProgressPageDto;
  @ApiProperty({ type: ExportReceiptPageDto }) receipts!: ExportReceiptPageDto;
  @ApiProperty({ type: ExportGradePageDto }) grades!: ExportGradePageDto;
  @ApiProperty({ type: ExportSupportPageDto }) support!: ExportSupportPageDto;
}
