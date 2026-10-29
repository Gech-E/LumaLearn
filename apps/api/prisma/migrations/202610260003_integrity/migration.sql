-- Application guards remain the authorization boundary. These constraints also
-- prevent accidental cross-version records and alteration of published evidence.
CREATE FUNCTION pathway_content_version(entity TEXT, record JSONB) RETURNS TEXT
LANGUAGE plpgsql STABLE AS $$
DECLARE result TEXT;
BEGIN
  CASE entity
    WHEN 'CourseVersion' THEN result := record->>'id';
    WHEN 'Module' THEN result := record->>'courseVersionId';
    WHEN 'ActivityVersion' THEN SELECT "courseVersionId" INTO result FROM "Module" WHERE id=record->>'moduleId';
    WHEN 'AssessmentVersion', 'RubricVersion' THEN
      SELECT m."courseVersionId" INTO result FROM "ActivityVersion" a JOIN "Module" m ON m.id=a."moduleId" WHERE a.id=record->>'activityId';
    WHEN 'QuestionVersion' THEN
      SELECT m."courseVersionId" INTO result FROM "AssessmentVersion" q JOIN "ActivityVersion" a ON a.id=q."activityId" JOIN "Module" m ON m.id=a."moduleId" WHERE q.id=record->>'assessmentId';
    ELSE RAISE EXCEPTION 'Unsupported content entity';
  END CASE;
  RETURN result;
END $$;

CREATE FUNCTION pathway_immutable_content() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE version_id TEXT;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    version_id := pathway_content_version(TG_TABLE_NAME,to_jsonb(OLD));
    IF EXISTS(SELECT 1 FROM "CourseVersion" WHERE id=version_id AND "publishedAt" IS NOT NULL) THEN
      RAISE EXCEPTION 'Published content is immutable; create a new version' USING ERRCODE='23514';
    END IF;
  END IF;
  IF TG_OP <> 'DELETE' AND TG_TABLE_NAME <> 'CourseVersion' THEN
    version_id := pathway_content_version(TG_TABLE_NAME,to_jsonb(NEW));
    IF EXISTS(SELECT 1 FROM "CourseVersion" WHERE id=version_id AND "publishedAt" IS NOT NULL) THEN
      RAISE EXCEPTION 'Published content is immutable; create a new version' USING ERRCODE='23514';
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER immutable_course_version BEFORE UPDATE OR DELETE ON "CourseVersion" FOR EACH ROW EXECUTE FUNCTION pathway_immutable_content();
CREATE TRIGGER immutable_module BEFORE INSERT OR UPDATE OR DELETE ON "Module" FOR EACH ROW EXECUTE FUNCTION pathway_immutable_content();
CREATE TRIGGER immutable_activity BEFORE INSERT OR UPDATE OR DELETE ON "ActivityVersion" FOR EACH ROW EXECUTE FUNCTION pathway_immutable_content();
CREATE TRIGGER immutable_assessment BEFORE INSERT OR UPDATE OR DELETE ON "AssessmentVersion" FOR EACH ROW EXECUTE FUNCTION pathway_immutable_content();
CREATE TRIGGER immutable_question BEFORE INSERT OR UPDATE OR DELETE ON "QuestionVersion" FOR EACH ROW EXECUTE FUNCTION pathway_immutable_content();
CREATE TRIGGER immutable_rubric BEFORE INSERT OR UPDATE OR DELETE ON "RubricVersion" FOR EACH ROW EXECUTE FUNCTION pathway_immutable_content();

CREATE FUNCTION pathway_enrollment_scope() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM "CourseVersion" v JOIN "Course" c ON c.id=v."courseId" JOIN "Membership" m ON m."organizationId"=c."organizationId" AND m."userId"=NEW."userId" WHERE v.id=NEW."courseVersionId" AND c.id=NEW."courseId" AND v."publishedAt" IS NOT NULL) THEN
    RAISE EXCEPTION 'Enrollment must reference a published version of its course and organization membership' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER enrollment_scope BEFORE INSERT OR UPDATE OF "courseVersionId", "courseId", "userId" ON "Enrollment" FOR EACH ROW EXECUTE FUNCTION pathway_enrollment_scope();

CREATE FUNCTION pathway_learning_scope() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE activity_id TEXT;
BEGIN
  IF TG_TABLE_NAME='Attempt' THEN SELECT "activityId" INTO activity_id FROM "AssessmentVersion" WHERE id=NEW."assessmentId";
  ELSE activity_id:=to_jsonb(NEW)->>'activityId'; END IF;
  IF NOT EXISTS(SELECT 1 FROM "Enrollment" e JOIN "Module" m ON m."courseVersionId"=e."courseVersionId" JOIN "ActivityVersion" a ON a."moduleId"=m.id WHERE e.id=NEW."enrollmentId" AND a.id=activity_id) THEN
    RAISE EXCEPTION 'Learning records must reference the enrolled content version' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER progress_scope BEFORE INSERT OR UPDATE ON "ProgressEvent" FOR EACH ROW EXECUTE FUNCTION pathway_learning_scope();
CREATE TRIGGER completion_scope BEFORE INSERT OR UPDATE ON "ActivityCompletion" FOR EACH ROW EXECUTE FUNCTION pathway_learning_scope();
CREATE TRIGGER attempt_scope BEFORE INSERT OR UPDATE ON "Attempt" FOR EACH ROW EXECUTE FUNCTION pathway_learning_scope();
CREATE TRIGGER submission_scope BEFORE INSERT OR UPDATE ON "Submission" FOR EACH ROW EXECUTE FUNCTION pathway_learning_scope();

CREATE FUNCTION pathway_attempt_snapshot() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."frozenQuestions" IS DISTINCT FROM OLD."frozenQuestions" OR NEW."assessmentId" <> OLD."assessmentId" OR NEW."enrollmentId" <> OLD."enrollmentId" OR NEW."startedAt" <> OLD."startedAt" OR NEW."expiresAt" IS DISTINCT FROM OLD."expiresAt" THEN
    RAISE EXCEPTION 'Attempt evidence and timing are immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER frozen_attempt BEFORE UPDATE ON "Attempt" FOR EACH ROW EXECUTE FUNCTION pathway_attempt_snapshot();

CREATE FUNCTION pathway_receipt_immutable() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Submission receipts are immutable' USING ERRCODE='23514'; END $$;
CREATE TRIGGER durable_receipt BEFORE UPDATE OR DELETE ON "SubmissionReceipt" FOR EACH ROW EXECUTE FUNCTION pathway_receipt_immutable();
