'use client';
import { t, copy, date } from '@/lib/i18n';
import Link from 'next/link';
import { ArrowRight, BookOpen, MessageCircle, Sparkles } from 'lucide-react';
import type { LearningHome } from '@/lib/types';
import { useApp } from './application';
import {
  Alert,
  Button,
  CourseCard,
  Empty,
  LinkButton,
  Loading,
  PageHeading,
  Progress,
  useData,
} from './ui';
import { activityHref } from './learning-shared';
export function LearnerHome({ all = false }: { all?: boolean }) {
  const { user } = useApp();
  const { data, error, loading, reload } = useData<LearningHome>('/learning/home');
  if (loading) return <Loading />;
  if (error)
    return (
      <>
        <Alert>{error}</Alert>
        <LinkButton href="/downloads">{t('Open downloaded lessons')}</LinkButton>
        <Button secondary onClick={reload}>
          {t('Try again ')}
        </Button>
      </>
    );
  const current = data?.items.find((c) => c.nextActivity) || data?.items[0];
  return (
    <>
      <PageHeading
        eyebrow={
          all
            ? t('YOUR LEARNING, AT YOUR PACE')
            : t('A LITTLE SPACE TO GROW \u00B7 {value0}', {
                value0: new Intl.DateTimeFormat('en', {
                  weekday: 'long',
                  timeZone: user?.timezone || 'Africa/Nairobi',
                })
                  .format(new Date())
                  .toUpperCase(),
              })
        }
        title={
          all
            ? t('Keep your curiosity going.')
            : t('Welcome back, {value0}.', { value0: user?.name.split(' ')[0] })
        }
        description={
          all
            ? t('Every course is a new possibility. Pick up wherever you left off.')
            : t('One clear next step. A little more confidence.')
        }
        action={
          <Link href="/courses" className="text-link">
            {t('Explore courses ')}
            <ArrowUpRightIcon />
          </Link>
        }
      />
      {!data?.items.length ? (
        <Empty title={copy('noCourses')} description={copy('noCoursesText')}>
          <LinkButton href="/courses">{copy('explore')}</LinkButton>
        </Empty>
      ) : (
        <>
          {!all && current ? (
            <div className="home-feature-grid">
              <section className="continue-panel">
                <div className="continue-copy">
                  <span className="eyebrow">{t('PICK UP WHERE YOU LEFT OFF')}</span>
                  <p className="course-context">{current.course.title}</p>
                  <h2>{current.nextActivity?.title || t('Look how far you\u2019ve come.')}</h2>
                  <p>
                    {current.nextActivity
                      ? t('A small step today can open a new possibility.')
                      : t('Your completed material is always here to revisit.')}
                  </p>
                  <LinkButton
                    href={
                      current.nextActivity
                        ? activityHref(current.nextActivity)
                        : `/learn/${current.course.id}`
                    }
                  >
                    {copy('continue')}
                  </LinkButton>
                  <div className="continue-progress">
                    <Progress value={current.progress} />
                    <span>{t('Your progress is saved as you go.')}</span>
                  </div>
                </div>
                <div className="continue-art" aria-hidden="true">
                  <span className="continue-sun" />
                  <div className="plant-pot" />
                  <div className="plant-stem" />
                  <span className="plant-leaf p1" />
                  <span className="plant-leaf p2" />
                  <span className="plant-leaf p3" />
                  <span className="plant-leaf p4" />
                  <div className="art-book">
                    <BookOpen size={48} strokeWidth={1.2} />
                  </div>
                </div>
              </section>
              <aside className="gentle-panel">
                <span className="small-icon warm">
                  <Sparkles size={22} />
                </span>
                <h2>
                  {t('Your pace is ')}
                  <br />
                  {t('the right pace. ')}
                </h2>
                <p>
                  {t('A few focused minutes count. There\u2019s no need to rush your next step.')}
                </p>
                <div className="gentle-rule" />
                <span className="eyebrow">{t('MAKE IT WORK FOR YOU')}</span>
                <Link href="/profile" className="text-link">
                  {t('Set your preferences ')}
                  <ArrowRight size={16} />
                </Link>
              </aside>
            </div>
          ) : null}
          <div className="section-heading">
            <div>
              <h2>{copy('yourCourses')}</h2>
              <p>{t('Your place is saved. Come back whenever you\u2019re ready.')}</p>
            </div>
            {!all ? (
              <Link className="text-link" href="/my-learning">
                {t('View all ')}
                <ArrowRight size={17} />
              </Link>
            ) : null}
          </div>
          <div className="course-grid">
            {data.items.map((item, index) => (
              <CourseCard
                key={item.id}
                course={item.course}
                index={index}
                progress={item.progress}
                href={`/learn/${item.course.id}`}
              />
            ))}
          </div>
        </>
      )}
      {data?.feedback.length ? (
        <section className="feedback-section">
          <div className="section-heading">
            <div>
              <span className="eyebrow">{t('A LITTLE GUIDANCE')}</span>
              <h2>{copy('feedback')}</h2>
            </div>
            <MessageCircle size={24} />
          </div>
          {data.feedback.map((item) => (
            <article className="feedback-card" key={item.id}>
              <span className="avatar">
                <MessageCircle size={22} />
              </span>
              <div>
                <p className="eyebrow">
                  {item.courseTitle} · {item.activityTitle}
                </p>
                <h3>{t('Something to take into your next step')}</h3>
                <p>{item.feedback}</p>
                <span className="muted">
                  {item.score}% · {date(item.releasedAt, user?.locale, user?.timezone)}
                </span>
              </div>
            </article>
          ))}
        </section>
      ) : null}
      <div className="help-ribbon">
        <span className="small-icon">
          <MessageCircle size={22} />
        </span>
        <div>
          <h3>{t('A little help goes a long way.')}</h3>
          <p>
            {t(
              'Questions are part of learning. You don\u2019t have to figure everything out alone.',
            )}
          </p>
        </div>
        <Link href="/help" className="text-link">
          {t('Ask for help ')}
          <ArrowRight size={18} />
        </Link>
      </div>
    </>
  );
}
function ArrowUpRightIcon() {
  return <ArrowRight size={17} className="diagonal-arrow" />;
}
