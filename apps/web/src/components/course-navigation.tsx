'use client';
import { t } from '@/lib/i18n';
import Link from 'next/link';
import { useApp } from './application';
export function CourseLinks({ id, current }: { id: string; current?: string }) {
  const { user } = useApp();
  return (
    <nav className="workspace-tabs" aria-label={t('Course workspace')}>
      <Link
        href={`/instructor/course/${id}`}
        aria-current={current === 'outline' ? 'page' : undefined}
      >
        {t('Outline & activities ')}
      </Link>
      <Link
        href={`/instructor/preview/${id}`}
        aria-current={current === 'preview' ? 'page' : undefined}
      >
        {t('Learner preview ')}
      </Link>
      <Link
        href={`/instructor/review/${id}`}
        aria-current={current === 'review' ? 'page' : undefined}
      >
        {t('Review & publish ')}
      </Link>
      <Link
        href={`/instructor/enrollments/${id}`}
        aria-current={current === 'enrollments' ? 'page' : undefined}
      >
        {t('Enrollments ')}
      </Link>
      {user?.roles.some((role) => ['INSTRUCTOR', 'ACADEMIC_ADMIN'].includes(role)) ? (
        <Link
          href={`/instructor/report/${id}`}
          aria-current={current === 'report' ? 'page' : undefined}
        >
          {t('Report ')}
        </Link>
      ) : null}
    </nav>
  );
}
