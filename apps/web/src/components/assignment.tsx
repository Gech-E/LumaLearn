'use client';
import { t, copy, date } from '@/lib/i18n';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, FileText } from 'lucide-react';
import { message, uploadFile } from '@/lib/api';
import { learningApi } from '@/lib/learning-api';
import { saveLocalDraft, readLocalDraft } from '@/lib/offline';
import type { Asset, Submission } from '@/lib/types';
import { useApp } from './application';
import {
  Alert,
  Badge,
  Button,
  Field,
  FormAction,
  Loading,
  PageHeading,
  TextContent,
  useData,
} from './ui';
import { useActivity } from './learning-shared';
interface LocalAssignment {
  text: string;
  link: string;
  assetIds: string[];
  requestId: string;
  revision: number;
  updatedAt: string;
}
export function Assignment({ id }: { id: string }) {
  const { user, online } = useApp();
  const { data: activity, loading, error } = useActivity(id);
  const {
    data: submission,
    error: submissionError,
    loading: submissionLoading,
    reload,
  } = useData<Submission>(online ? `/submissions/${id}` : null);
  const [text, setText] = useState('');
  const [link, setLink] = useState('');
  const [assetIds, setAssetIds] = useState<string[]>([]);
  const [files, setFiles] = useState<Asset[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState('');
  const [failure, setFailure] = useState('');
  const [ready, setReady] = useState(false);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const locked = submission?.state === 'SUBMITTED';
  useEffect(() => {
    if (!user || submissionLoading) return;
    let active = true;
    void readLocalDraft<LocalAssignment>(user.id, id)
      .then((local) => {
        if (!active) return;
        const localNewer =
          local &&
          (!submission ||
            (!locked &&
              local.revision === (submission.revision || 1) &&
              local.updatedAt > (submission.updatedAt || '')));
        setText(localNewer ? local.text : submission?.text || '');
        setLink(localNewer ? local.link : submission?.link || '');
        setAssetIds(localNewer ? local.assetIds || [] : submission?.assetIds || []);
        setRequestId(
          local && local.revision === (submission?.revision || 1)
            ? local.requestId
            : crypto.randomUUID(),
        );
        setReady(true);
      })
      .catch((e) => {
        if (active) {
          setFailure(message(e));
          setReady(true);
        }
      });
    return () => {
      active = false;
    };
  }, [id, user?.id, submission, submissionLoading, locked]);
  useEffect(() => {
    if (user && ready && !locked)
      void saveLocalDraft(user.id, id, {
        text,
        link,
        assetIds,
        requestId,
        revision: submission?.revision || 1,
        updatedAt: new Date().toISOString(),
      }).catch((e) => setFailure(message(e)));
  }, [user?.id, id, text, link, assetIds, requestId, submission?.revision, ready, locked]);
  useEffect(() => {
    if (!online || !assetIds.length) {
      setFiles([]);
      return;
    }
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function check() {
      try {
        const result = await Promise.all(assetIds.map((assetId) => learningApi.file(assetId)));
        if (active) {
          setFiles(result);
          if (result.some((file) => ['QUARANTINED', 'UPLOADING'].includes(file.status)))
            timer = setTimeout(() => void check(), 5000);
        }
      } catch (e) {
        if (active) setFailure(message(e));
      }
    }
    void check();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [assetIds, online]);
  async function upload(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setFailure('');
    setStatus('');
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error(t('Choose a file no larger than 10 MB.'));
      const result = await uploadFile(file);
      setAssetIds((current) => [...current, result.id]);
      setStatus(t('File uploaded privately. Wait for its security check before submitting.'));
    } catch (error) {
      setFailure(
        t('{value0} Your written draft is still here. Choose the file again to retry.', {
          value0: message(error),
        }),
      );
    } finally {
      setUploading(false);
    }
  }
  async function save(submit = false) {
    setBusy(true);
    setFailure('');
    setStatus('');
    try {
      if (!online) {
        if (user)
          await saveLocalDraft(user.id, id, {
            text,
            link,
            assetIds,
            requestId,
            revision: submission?.revision || 1,
            updatedAt: new Date().toISOString(),
          });
        setStatus(copy('localSaved'));
        return;
      }
      if (submit) {
        const current = await learningApi.submission(id);
        if (current.state === 'SUBMITTED') {
          setStatus(
            t('Your work was already received. Receipt: {value0}', { value0: current.receipt }),
          );
          reload();
          return;
        }
      }
      await learningApi.saveDraft(id, { text, link: link || undefined, assetIds });
      if (submit) {
        const result = await learningApi.submitAssignment(id, { requestId });
        setStatus(t('Your work is submitted. Receipt: {value0}', { value0: result.receipt }));
      } else setStatus(copy('draftSaved'));
      reload();
    } catch (error) {
      setFailure(message(error));
    } finally {
      setBusy(false);
    }
  }
  if (loading || submissionLoading || !ready) return <Loading />;
  if (error || !activity) return <Alert>{error || t('This assignment is unavailable.')}</Alert>;
  const filesReady = assetIds.every((assetId) =>
    files.some((file) => file.id === assetId && file.status === 'CLEAN'),
  );
  return (
    <>
      <Link href={`/learn/${activity.courseId}`} className="back-link">
        ← {activity.courseTitle}
      </Link>
      <PageHeading
        eyebrow={t('TURN LEARNING INTO SOMETHING REAL')}
        title={activity.title}
        description={copy('assignmentIntro')}
      />
      <div className="assignment-layout">
        <section className="panel">
          <TextContent text={activity.body} />
          {failure || submissionError ? <Alert>{failure || submissionError}</Alert> : null}
          {status ? <Alert success>{status}</Alert> : null}
          {submission?.receipt ? (
            <div className="receipt">
              <CheckCircle2 size={23} />
              <div>
                <strong>
                  {locked
                    ? t('Submitted \u00B7 Your work is safely received')
                    : t('Previous submission received \u00B7 Revision {value0}', {
                        value0: submission.revision,
                      })}
                </strong>
                <span>
                  {copy('submissionReceipt')}: {submission.receipt}
                </span>
              </div>
            </div>
          ) : null}
          {submission?.state === 'REVISION_REQUESTED' ? (
            <Alert success>
              {t(
                'Your instructor invited a revision. Review the feedback, update your work, and submit again. ',
              )}
            </Alert>
          ) : null}
          <FormAction onSubmit={() => save(false)}>
            <fieldset disabled={locked || busy || uploading} className="assignment-fields">
              <legend className="sr-only">{t('Your assignment draft')}</legend>
              <Field
                id="work-link"
                label={copy('workLink')}
                hint={t('Use a shareable https:// link your instructor can open.')}
              >
                <input
                  id="work-link"
                  type="url"
                  value={link}
                  onChange={(event) => setLink(event.target.value)}
                  placeholder="https://"
                  maxLength={2000}
                />
              </Field>
              <Field id="work-notes" label={copy('workNotes')}>
                <textarea
                  id="work-notes"
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  rows={7}
                  maxLength={20000}
                  placeholder={t(
                    'Tell your instructor what you made, what you learned, and where you\u2019d appreciate feedback.',
                  )}
                />
              </Field>
              <div className="upload-box">
                <Field
                  id="work-file"
                  label={t('Attach a file')}
                  hint={t(
                    'Up to five PDF, PNG, JPEG, UTF-8 text, or CSV files, 10 MB each. Files stay private and require a security check.',
                  )}
                >
                  <input
                    id="work-file"
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.txt,.csv"
                    disabled={!online || assetIds.length >= 5}
                    onChange={(event) => {
                      void upload(event.target.files?.[0]);
                      event.target.value = '';
                    }}
                  />
                </Field>
                {uploading ? (
                  <p role="status">
                    {t('Uploading. Keep this page open until the upload finishes.')}
                  </p>
                ) : null}
                {assetIds.map((assetId, index) => {
                  const file = files.find((file) => file.id === assetId);
                  return (
                    <div className="file-item" key={assetId}>
                      <FileText size={18} />
                      <span>
                        {file?.name || `Attachment ${index + 1}`}
                        {file
                          ? t(' \u00B7 {value0} KB', { value0: (file.size / 1024).toFixed(1) })
                          : ''}
                        <span className="field-hint">
                          {file?.status === 'CLEAN'
                            ? t('Security check passed')
                            : file?.status === 'REJECTED'
                              ? t('Security check failed. Remove this file.')
                              : file
                                ? t('Waiting for security check')
                                : t('File status needs a connection')}
                        </span>
                      </span>
                      <button
                        className="text-button"
                        type="button"
                        onClick={() =>
                          setAssetIds((current) => current.filter((value) => value !== assetId))
                        }
                        aria-label={t('Remove {value0}', {
                          value0: file?.name || `attachment ${index + 1}`,
                        })}
                      >
                        {t('Remove ')}
                      </button>
                    </div>
                  );
                })}
              </div>
              <div className="actions">
                <Button secondary type="submit" busy={busy}>
                  {copy('saveDraft')}
                </Button>
                <Button
                  type="button"
                  busy={busy}
                  disabled={!online || !filesReady || (!text.trim() && !link && !assetIds.length)}
                  onClick={() => void save(true)}
                >
                  {copy('submitWork')}
                  <ArrowRight size={18} />
                </Button>
              </div>
            </fieldset>
            <p className="field-hint">
              {locked
                ? t('This submitted version is protected. Your instructor can request a revision.')
                : t(
                    'Drafts are saved on this device. Submitting requires a connection, checked files, and server confirmation.',
                  )}
            </p>
          </FormAction>
        </section>
        <aside className="stack">
          <section className="panel soft">
            <span className="eyebrow">{t('KNOW WHAT TO AIM FOR')}</span>
            <h2>{copy('rubric')}</h2>
            {(submission?.rubric || activity.rubric?.criteria || []).map((criterion) => (
              <div className="rubric-item" key={criterion.id}>
                <strong>
                  {criterion.title}
                  <span>
                    {criterion.maxPoints}
                    {t(' pts')}
                  </span>
                </strong>
                <p>{criterion.description}</p>
              </div>
            ))}
          </section>
          <section className="panel">
            <span className="eyebrow">{t('A LITTLE GUIDANCE')}</span>
            <h2>{copy('feedback')}</h2>
            {submission?.grades?.length ? (
              submission.grades.map((grade) => (
                <div className="feedback-entry" key={grade.id}>
                  <Badge>{grade.score}%</Badge>
                  <p>{grade.feedback}</p>
                  {grade.revisionRequested ? (
                    <Badge tone="amber">{t('Revision requested')}</Badge>
                  ) : null}
                  <p className="field-hint">
                    {t('Released ')}
                    {grade.releasedAt ? date(grade.releasedAt, user?.locale, user?.timezone) : ''}
                  </p>
                </div>
              ))
            ) : (
              <p className="muted">{copy('emptyFeedback')}</p>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
