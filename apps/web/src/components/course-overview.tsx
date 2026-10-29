'use client';
import { t, copy } from '@/lib/i18n';
import Link from 'next/link';
import {
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  FileText,
  Leaf,
  MessageCircle,
} from 'lucide-react';
import type { CourseLearning } from '@/lib/types';
import { Alert, Badge, LinkButton, Loading, PageHeading, Progress, useData } from './ui';
import { activityHref } from './learning-shared';
export function CourseOverview({ id }: { id: string }) {
  const { data, loading, error } = useData<CourseLearning>(`/learning/courses/${id}`);
  if (loading) return <Loading />;
  if (error || !data) return <Alert>{error || t('This course could not load.')}</Alert>;
  return (
    <>
      <Link href="/my-learning" className="back-link">
        {t('\u2190 My learning ')}
      </Link>
      <PageHeading
        eyebrow={t('YOUR NEXT CHAPTER')}
        title={data.course.title}
        description={data.course.summary}
        action={
          data.nextActivity ? (
            <LinkButton href={activityHref(data.nextActivity)}>{copy('continue')}</LinkButton>
          ) : (
            <Badge>{copy('completed')}</Badge>
          )
        }
      />
      <div className="course-overview-grid">
        <section className="panel">
          <div className="section-heading">
            <h2>{copy('outline')}</h2>
            <span>
              {data.version.modules.length}
              {t(' modules')}
            </span>
          </div>
          {data.version.modules.map((module, index) => (
            <div key={module.id} className="learning-module">
              <div className="module-heading">
                <span className="module-number">{String(index + 1).padStart(2, '0')}</span>
                <h3>{module.title}</h3>
              </div>
              {module.activities.map((activity) => {
                const state = data.completions.find((c) => c.activityId === activity.id)?.state;
                return (
                  <Link className="activity-row" key={activity.id} href={activityHref(activity)}>
                    <span
                      className={`activity-icon ${state === 'COMPLETED' || state === 'PASSED' ? 'done' : ''}`}
                    >
                      {state === 'COMPLETED' || state === 'PASSED' ? (
                        <Check size={18} />
                      ) : activity.kind === 'ASSIGNMENT' ? (
                        <FileText size={18} />
                      ) : (
                        <BookOpen size={18} />
                      )}
                    </span>
                    <div>
                      <strong>{activity.title}</strong>
                      <span>
                        {activity.kind.toLowerCase()} · {activity.estimatedMinutes || 5}
                        {t(' min ')}
                      </span>
                    </div>
                    {state ? (
                      <Badge tone={state === 'VIEWED' ? 'neutral' : 'green'}>
                        {state.toLowerCase()}
                      </Badge>
                    ) : null}
                    <ChevronRight size={19} />
                  </Link>
                );
              })}
            </div>
          ))}
        </section>
        <aside className="stack">
          <section className="panel">
            <span className="eyebrow">{t('STEP BY STEP')}</span>
            <h2>{t('Your progress')}</h2>
            <Progress value={data.progress} />
            <p className="muted">
              {t('Viewed, completed, and passed activities are recorded separately. ')}
            </p>
          </section>
          <section className="panel soft">
            <Leaf size={27} />
            <h3>{copy('objective')}</h3>
            <ul className="check-list">
              {data.version.outcomes.map((outcome) => (
                <li key={outcome}>
                  <CheckCircle2 size={18} />
                  <span>{outcome}</span>
                </li>
              ))}
            </ul>
          </section>
          <Link href={`/help?courseId=${id}`} className="help-card">
            <MessageCircle size={20} />
            <span>
              {t('Questions about this course? ')}
              <strong>
                {t('Ask for a little help ')}
                <ArrowRight size={16} />
              </strong>
            </span>
          </Link>
        </aside>
      </div>
    </>
  );
}
