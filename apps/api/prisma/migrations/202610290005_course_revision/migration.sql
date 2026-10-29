ALTER TABLE "CourseVersion" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "CourseVersion" ADD CONSTRAINT "CourseVersion_revision_positive" CHECK ("revision" > 0);
