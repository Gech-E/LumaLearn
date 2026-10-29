import type { components } from '@pathway/api-client';
export interface User {
  id: string;
  email: string;
  name: string;
  organizationId: string;
  membershipId: string;
  roles: string[];
  verified: boolean;
  mfaEnabled: boolean;
  timezone?: string;
  locale?: string;
  reminders?: boolean;
  quietStart?: string;
  quietEnd?: string;
}
export interface Session {
  user: User;
  csrfToken: string;
}
export interface Course {
  id: string;
  title: string;
  slug: string;
  summary: string;
  subject: string;
  level: string;
  language: string;
  format: string;
  instructorName: string;
  effortMinutes: number;
  status?: string;
  version?: CourseVersion;
}
export interface ActivitySummary {
  id: string;
  title: string;
  kind: string;
  estimatedMinutes?: number;
  position?: number;
}
export interface Module {
  id: string;
  title: string;
  position: number;
  activities: ActivitySummary[];
}
export interface CourseVersion {
  id: string;
  title: string;
  description: string;
  outcomes: string[];
  prerequisites: string[];
  completionRule: string | Record<string, unknown>;
  modules: Module[];
  number?: number;
  state?: string;
}
export interface Enrollment {
  id: string;
  state: string;
  course: Course;
  progress: number;
  nextActivity: ActivitySummary | null;
}
export interface Feedback {
  id: string;
  score: number;
  feedback: string;
  activityTitle: string;
  courseTitle: string;
  releasedAt: string;
  revisionRequested?: boolean;
}
export interface LearningHome {
  items: Enrollment[];
  feedback: Feedback[];
}
export interface CourseLearning {
  course: Course;
  version: CourseVersion;
  enrollment: { id: string; state: string };
  completions: { activityId: string; state: string }[];
  progress: number;
  nextActivity: ActivitySummary | null;
}
export interface Criterion {
  id: string;
  title: string;
  maxPoints: number;
  description: string;
}
export interface Rubric {
  criteria: Criterion[];
  passPercent: number;
}
export type Activity = Omit<components['schemas']['LessonResponse'], 'resources'> & {
  resources: (components['schemas']['ResourceDto'] & {
    id?: string;
    assetId?: string;
    text?: string;
  })[];
};
export type Attempt = components['schemas']['AttemptResponse'];
export type Result = components['schemas']['AttemptResponse'];
export type Submission = components['schemas']['SubmissionResponse'];
export type Asset = components['schemas']['AssetDto'];
export interface Notification {
  id: string;
  title: string;
  body: string;
  readAt?: string;
  createdAt: string;
  href?: string;
  essential?: boolean;
}
export interface Ticket {
  id: string;
  subject: string;
  message: string;
  status: string;
  createdAt: string;
  response?: string;
  activityId?: string;
}
export interface Page<T> {
  items: T[];
  total?: number;
  page?: number;
  limit?: number;
}
