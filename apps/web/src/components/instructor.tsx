'use client';
import { t, copy } from '@/lib/i18n';
import Link from 'next/link';
import type { Course, Page } from '@/lib/types';
import { useApp } from './application';
import { MfaSetup } from './account';
import { Alert, Badge, CourseArt, Empty, LinkButton, Loading, PageHeading, useData } from './ui';
import { CreateCourse, CourseEditor, Preview, Publication } from './course-authoring';
import { EnrollmentManager } from './course-enrollments';
import { Submissions, GradeWork, CourseReport } from './teaching-work';
interface ManagedCourse extends Course {
  state: string;
  enrollmentCount: number;
}
export function Instructor({ path }: { path: string[] }) {
  const { user } = useApp();
  if (!user?.roles.some((r) => ['INSTRUCTOR', 'ADMIN', 'ACADEMIC_ADMIN'].includes(r)))
    return <Alert>{copy('permission')}</Alert>;
  if (!user.mfaEnabled)
    return (
      <>
        <PageHeading
          title={copy('finishMfa')}
          description={t('Your teaching and learner records need a second sign-in step.')}
        />
        <MfaSetup />
      </>
    );
  const section = path[0] || 'overview';
  const id = path[1];
  const academic = user.roles.some((role) => ['INSTRUCTOR', 'ACADEMIC_ADMIN'].includes(role));
  if (['submissions', 'grade', 'report'].includes(section) && !academic)
    return <Alert>{t('Academic record access is required for this page.')}</Alert>;
  return (
    <>
      <PageHeading
        eyebrow={t('INSTRUCTOR WORKSPACE')}
        title={copy('instructorTitle')}
        description={copy('instructorIntro')}
        action={<LinkButton href="/instructor/new">{copy('courseCreate')}</LinkButton>}
      />
      <nav className="workspace-tabs" aria-label={t('Instructor navigation')}>
        <Link href="/instructor" aria-current={section === 'overview' ? 'page' : undefined}>
          {t('Overview & courses ')}
        </Link>
        {academic ? (
          <Link
            href="/instructor/submissions"
            aria-current={section === 'submissions' ? 'page' : undefined}
          >
            {copy('submissions')}
          </Link>
        ) : null}
      </nav>
      {section === 'new' ? (
        <CreateCourse />
      ) : section === 'course' && id ? (
        <CourseEditor key={id} id={id} />
      ) : section === 'preview' && id ? (
        <Preview id={id} />
      ) : section === 'review' && id ? (
        <Publication id={id} />
      ) : section === 'enrollments' && id ? (
        <EnrollmentManager id={id} />
      ) : section === 'report' && id ? (
        <CourseReport id={id} />
      ) : section === 'grade' && id ? (
        <GradeWork id={id} />
      ) : section === 'submissions' ? (
        <Submissions />
      ) : (
        <InstructorHome />
      )}
    </>
  );
}
function InstructorHome() {
  const { user } = useApp();
  const { data, loading, error } = useData<Page<ManagedCourse>>('/courses/assigned');
  if (loading) return <Loading />;
  if (error) return <Alert>{error}</Alert>;
  return (
    <>
      {data?.items.length ? (
        <>
          <div className="metric-grid">
            <div className="metric">
              <span>{t('Your courses')}</span>
              <strong>{data.items.length}</strong>
            </div>
            <div className="metric">
              <span>{t('Published courses')}</span>
              <strong>{data.items.filter((c) => c.state === 'PUBLISHED').length}</strong>
            </div>
            <div className="metric">
              <span>{t('Enrolled learners')}</span>
              <strong>{data.items.reduce((n, c) => n + c.enrollmentCount, 0)}</strong>
            </div>
          </div>
          <div className="course-grid">
            {data.items.map((course, index) => (
              <article className="course-card" key={course.id}>
                <CourseArt variant={index} />
                <div className="course-card-body">
                  <div className="card-kicker">
                    <span>{course.subject}</span>
                    <Badge tone={course.state === 'PUBLISHED' ? 'green' : 'amber'}>
                      {course.state.toLowerCase()}
                    </Badge>
                  </div>
                  <h3>{course.title}</h3>
                  <p>{course.summary}</p>
                  <div className="actions">
                    <LinkButton href={`/instructor/course/${course.id}`}>
                      {t('Open course')}
                    </LinkButton>
                  </div>
                  <div className="item-footer">
                    <span>
                      {course.enrollmentCount}
                      {t(' enrolled')}
                    </span>
                    {user?.roles.some((role) => ['INSTRUCTOR', 'ACADEMIC_ADMIN'].includes(role)) ? (
                      <Link className="text-link" href={`/instructor/report/${course.id}`}>
                        {t('Course report ')}
                      </Link>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </>
      ) : (
        <Empty
          title={t('A thoughtful course starts here.')}
          description={t(
            'Create a draft, add clear activities, and review accessibility before publishing.',
          )}
        >
          <LinkButton href="/instructor/new">{copy('courseCreate')}</LinkButton>
        </Empty>
      )}
    </>
  );
}
