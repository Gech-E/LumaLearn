'use client';
import { t, copy } from '@/lib/i18n';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Download,
  FileText,
  MessageCircle,
  Play,
  Sparkles,
} from 'lucide-react';
import { message } from '@/lib/api';
import { learningApi } from '@/lib/learning-api';
import { downloadLesson, recordProgress } from '@/lib/offline';
import type { Activity } from '@/lib/types';
import { useApp } from './application';
import { Alert, Button, Loading, PageHeading, TextContent } from './ui';
import { useActivity, activityHref, neighborHref, nextHref } from './learning-shared';
export function Lesson({ id }: { id: string }) {
  const { user, online } = useApp();
  const { data: activity, error, loading } = useActivity(id);
  const [status, setStatus] = useState('');
  const [failure, setFailure] = useState('');
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('lesson');
  const [complete, setComplete] = useState(false);
  useEffect(() => {
    setStatus('');
    setComplete(false);
    setTab('lesson');
  }, [id]);
  useEffect(() => {
    if (activity) setComplete(['COMPLETED', 'PASSED'].includes(activity.completion || ''));
  }, [activity]);
  useEffect(() => {
    if (activity && user)
      void recordProgress(user.id, activity.id, 'VIEWED').catch((e) => setFailure(message(e)));
  }, [activity?.id, user?.id]);
  async function finish() {
    if (!user) return;
    setBusy(true);
    setFailure('');
    try {
      const synced = await recordProgress(user.id, id, 'COMPLETED');
      setStatus(copy(synced ? 'saved' : 'localSaved'));
      setComplete(true);
    } catch (e) {
      setFailure(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function download() {
    if (!user || !activity) return;
    setFailure('');
    try {
      await downloadLesson(user.id, activity);
      setStatus(
        t('This text lesson is saved on this device for 7 days. Open Downloads to manage it.'),
      );
    } catch (e) {
      setStatus(message(e));
    }
  }
  if (loading) return <Loading />;
  if (error || !activity) return <Alert>{error}</Alert>;
  return (
    <>
      <div className="lesson-breadcrumb">
        <Link href={`/learn/${activity.courseId}`}>{activity.courseTitle}</Link>
        <ChevronRight size={15} />
        <span>{copy('lesson')}</span>
      </div>
      <PageHeading
        eyebrow={t('A SMALL STEP FORWARD')}
        title={activity.title}
        description={activity.objective}
      />
      <div className="lesson-layout">
        <article className="lesson-content">
          <div className="lesson-toolbar">
            <span>
              <Clock3 size={16} />
              {activity.estimatedMinutes}
              {t(' min \u00B7 Read at your own pace ')}
            </span>
            <button
              className="text-button"
              disabled={!online || activity.offlineAllowed === false}
              onClick={() => void download()}
            >
              <Download size={17} />
              {copy('download')}
            </button>
          </div>
          {failure ? <Alert>{failure}</Alert> : null}
          {status ? <Alert success>{status}</Alert> : null}
          {activity.videoUrl ? (
            <video controls preload="none" crossOrigin="anonymous">
              <source src={activity.videoUrl} />
              {activity.captionsUrl ? (
                <track
                  default
                  kind="captions"
                  src={activity.captionsUrl}
                  srcLang="en"
                  label={t('English')}
                />
              ) : null}
            </video>
          ) : (
            <div className="reading-intro">
              <span className="small-icon">
                <BookOpen size={23} />
              </span>
              <div>
                <strong>{t('A little focus. A useful new skill.')}</strong>
                <span>{t('Everything you need is in the reading below.')}</span>
              </div>
            </div>
          )}
          <div className="lesson-tabs" role="group" aria-label={t('Lesson content')}>
            <button
              aria-pressed={tab === 'lesson'}
              aria-controls="lesson-panel"
              id="lesson-tab"
              onClick={() => setTab('lesson')}
            >
              {copy('lesson')}
            </button>
            {activity.transcript ? (
              <button
                aria-pressed={tab === 'transcript'}
                aria-controls="transcript-panel"
                id="transcript-tab"
                onClick={() => setTab('transcript')}
              >
                {copy('transcript')}
              </button>
            ) : null}
            <Link href={`/help?activityId=${id}`}>
              <MessageCircle size={16} />
              {t('Ask for help ')}
            </Link>
          </div>
          {tab === 'transcript' ? (
            <section role="region" id="transcript-panel" aria-labelledby="transcript-tab">
              <TextContent text={activity.transcript || ''} />
            </section>
          ) : (
            <section role="region" id="lesson-panel" aria-labelledby="lesson-tab">
              <TextContent text={activity.body} />
              {activity.example ? (
                <section className="worked-example">
                  <span className="eyebrow">{t('LET\u2019S MAKE IT PRACTICAL')}</span>
                  <h2>{copy('example')}</h2>
                  <TextContent text={activity.example} />
                </section>
              ) : null}
              <section className="reflection">
                <span className="small-icon warm">
                  <Sparkles size={22} />
                </span>
                <div>
                  <h2>{copy('reflection')}</h2>
                  <p>{activity.reflection || copy('reflectionText')}</p>
                </div>
              </section>
            </section>
          )}
          {activity.resources?.length ? (
            <section className="resources">
              <h2>{copy('resources')}</h2>
              {activity.resources.map((resource, index) => (
                <ResourceLink key={resource.id || index} resource={resource} online={online} />
              ))}
            </section>
          ) : null}
          <div className="lesson-completion">
            <div>
              <CheckCircle2 size={27} />
              <h3>{complete ? t('A step well taken.') : t('Ready for your next step?')}</h3>
              <p>
                {complete
                  ? copy('completedMessage')
                  : t('Mark this lesson complete when you\u2019ve worked through it.')}
              </p>
            </div>
            <Button onClick={() => void finish()} busy={busy} disabled={complete}>
              {complete ? (
                <>
                  <Check size={18} />
                  {copy('completed')}
                </>
              ) : (
                copy('markComplete')
              )}
            </Button>
          </div>
          <div className="lesson-navigation">
            {activity.previousId ? (
              <Link href={neighborHref(activity, activity.previousId)}>
                <ArrowLeft size={18} />
                {copy('previous')}
              </Link>
            ) : (
              <span />
            )}
            {activity.nextId ? (
              <Link href={nextHref(activity)}>
                {copy('next')}
                <ArrowRight size={18} />
              </Link>
            ) : (
              <Link href={`/learn/${activity.courseId}`}>
                {t('Return to course ')}
                <ArrowRight size={18} />
              </Link>
            )}
          </div>
          {!online ? <p className="muted">{copy('offlineLimits')}</p> : null}
        </article>
        <aside className="lesson-outline panel">
          <span className="eyebrow">{t('THE BIGGER PICTURE')}</span>
          <h2>{copy('outline')}</h2>
          {activity.outline?.map((module, index) => (
            <div key={module.id}>
              <h3>
                <span>{String(index + 1).padStart(2, '0')}</span>
                {module.title}
              </h3>
              {module.activities.map((item) => (
                <Link
                  key={item.id}
                  className={item.id === id ? 'current' : ''}
                  href={activityHref(item)}
                  aria-current={item.id === id ? 'step' : undefined}
                >
                  {item.id === id ? <Play size={14} /> : <span className="outline-dot" />}
                  <span>{item.title}</span>
                </Link>
              ))}
            </div>
          ))}
          <Link className="outline-back" href={`/learn/${activity.courseId}`}>
            {t('Course overview ')}
            <ArrowRight size={15} />
          </Link>
        </aside>
      </div>
    </>
  );
}
function ResourceLink({
  resource,
  online,
}: {
  resource: NonNullable<Activity['resources']>[number];
  online: boolean;
}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function open() {
    if (!resource.assetId) return;
    setBusy(true);
    setError('');
    try {
      const file = await learningApi.fileDownload(resource.assetId);
      window.location.assign(file.url);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  function downloadText() {
    if (!resource.text) return;
    const url = URL.createObjectURL(
      new Blob([resource.text], { type: 'text/plain;charset=utf-8' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `${resource.title.replace(/[^\p{L}\p{N} ._-]/gu, '').slice(0, 100) || 'resource'}.txt`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div>
      {resource.text ? (
        <Button secondary onClick={downloadText}>
          <Download size={18} />
          {resource.title} · {copy('downloadText')}
        </Button>
      ) : resource.url && online ? (
        <a href={resource.url} target="_blank" rel="noreferrer">
          <FileText size={18} />
          {resource.title}
          <ArrowRight size={16} />
        </a>
      ) : resource.assetId ? (
        <Button secondary busy={busy} disabled={!online} onClick={() => void open()}>
          <FileText size={18} />
          {resource.title}
        </Button>
      ) : (
        <span>{resource.title}</span>
      )}
      {!online && !resource.text ? (
        <p className="field-hint">{t('The resource file needs a connection.')}</p>
      ) : null}
      {error ? <Alert>{error}</Alert> : null}
    </div>
  );
}
