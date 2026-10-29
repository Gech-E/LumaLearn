'use client';
import { Pagination } from './pagination';
import { t, copy, date } from '@/lib/i18n';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { api, message } from '@/lib/api';
import type { Criterion, Feedback, Page } from '@/lib/types';
import {
  Alert,
  Badge,
  Button,
  Empty,
  Field,
  FormAction,
  LinkButton,
  Loading,
  PageHeading,
  Progress,
  TextContent,
  useData,
} from './ui';
import { CourseLinks } from './course-navigation';
interface WorkRow {
  id: string;
  activityTitle: string;
  courseTitle: string;
  learner: {
    name: string;
    email: string;
  };
  state: string;
  submittedAt: string;
  latestGrade?: Feedback;
  revision: number;
}
interface Work extends WorkRow {
  text: string;
  link?: string;
  assetIds: string[];
  rubric: Criterion[];
  grades: (Feedback & {
    revision: number;
    releasedAt?: string;
    criteriaScores: {
      criterionId: string;
      points: number;
    }[];
  })[];
  receipt: string;
  history: {
    revision: number;
    receipt: string;
    submittedAt: string;
  }[];
}
export function Submissions() {
  const [page, setPage] = useState(1);
  const { data, loading, error } = useData<Page<WorkRow>>(
    `/grading/submissions?page=${page}&limit=20`,
  );
  return (
    <>
      <PageHeading
        title={t('A little feedback goes a long way.')}
        description={t(
          'Review submitted work, save a private grade, and release it when it\u2019s ready.',
        )}
      />
      {loading ? (
        <Loading />
      ) : error ? (
        <Alert>{error}</Alert>
      ) : data?.items.length ? (
        <>
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('Learner')}</th>
                  <th>{t('Assignment')}</th>
                  <th>{t('Feedback')}</th>
                  <th>{t('Review')}</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.learner.name}</strong>
                      <p>{item.learner.email}</p>
                    </td>
                    <td>
                      {item.activityTitle}
                      <p>
                        {item.courseTitle}
                        {t(' \u00B7 revision ')}
                        {item.revision}
                      </p>
                    </td>
                    <td>
                      <Badge tone={item.latestGrade?.releasedAt ? 'green' : 'amber'}>
                        {item.latestGrade?.releasedAt
                          ? t('Released')
                          : item.latestGrade
                            ? t('Private draft')
                            : t('Needs review')}
                      </Badge>
                    </td>
                    <td>
                      <LinkButton secondary href={`/instructor/grade/${item.id}`}>
                        {t('Review work ')}
                      </LinkButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pagination">
            <Button secondary disabled={page === 1} onClick={() => setPage(page - 1)}>
              {t('Previous ')}
            </Button>
            <span>
              {t('Page ')}
              {page}
            </span>
            <Button
              secondary
              disabled={page * 20 >= (data.total || 0)}
              onClick={() => setPage(page + 1)}
            >
              {t('Next ')}
            </Button>
          </div>
        </>
      ) : (
        <Empty
          title={t('No submitted work to review yet.')}
          description={t('Your assigned learners\u2019 submissions will appear here.')}
        />
      )}
    </>
  );
}
export function GradeWork({ id }: { id: string }) {
  const { data, loading, error, reload } = useData<Work>(`/grading/submissions/${id}`);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [feedback, setFeedback] = useState('');
  const [revision, setRevision] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    if (data) {
      const latest = data.grades[0];
      setScores(
        Object.fromEntries(
          data.rubric.map((c) => [
            c.id,
            latest?.criteriaScores.find((s) => s.criterionId === c.id)?.points || 0,
          ]),
        ),
      );
      setFeedback(latest?.feedback || '');
      setRevision(latest?.revisionRequested || false);
    }
  }, [data]);
  async function save() {
    if (!data) return;
    setBusy(true);
    setFailure('');
    try {
      await api(`/grading/submissions/${id}/grades`, 'POST', {
        criteriaScores: data.rubric.map((c) => ({ criterionId: c.id, points: scores[c.id] || 0 })),
        feedback,
        revisionRequested: revision,
      });
      setNotice(t('Feedback saved privately. Release it explicitly when ready.'));
      reload();
    } catch (e) {
      setFailure(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function release(gradeId: string) {
    setBusy(true);
    setFailure('');
    try {
      await api(`/grading/grades/${gradeId}/release`, 'POST', {});
      setNotice(t('Feedback released to the learner.'));
      reload();
    } catch (e) {
      setFailure(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function download(assetId: string) {
    try {
      const file = await api<{
        url: string;
      }>(`/media/${assetId}/download`);
      window.open(file.url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      setFailure(message(e));
    }
  }
  if (loading) return <Loading />;
  if (error || !data) return <Alert>{error}</Alert>;
  return (
    <>
      <Link className="back-link" href="/instructor/submissions">
        {t('\u2190 All submissions ')}
      </Link>
      <PageHeading
        title={data.activityTitle}
        description={t('{value0} \u00B7 {value1} \u00B7 Revision {value2}', {
          value0: data.learner.name,
          value1: data.courseTitle,
          value2: data.revision,
        })}
      />
      {failure ? <Alert>{failure}</Alert> : null}
      {notice ? <Alert success>{notice}</Alert> : null}
      <div className="course-workspace-grid">
        <section className="panel">
          <h2>{t('Submitted work')}</h2>
          <TextContent text={data.text} />
          {data.link ? (
            <a className="safe-link" href={data.link} target="_blank" rel="noreferrer">
              {data.link}
            </a>
          ) : null}
          {data.assetIds.map((assetId, index) => (
            <button className="text-button" key={assetId} onClick={() => void download(assetId)}>
              {t('Download attached file ')}
              {index + 1}
            </button>
          ))}
          <div className="receipt">
            <ClipboardCheck size={21} />
            <div>
              <strong>{t('Submission receipt')}</strong>
              <span>{data.receipt}</span>
            </div>
          </div>
          <h3>{t('Rubric-based review')}</h3>
          <FormAction onSubmit={save}>
            {data.rubric.map((c) => (
              <div className="rubric-item" key={c.id}>
                <strong>
                  {c.title}
                  <span>
                    {c.maxPoints}
                    {t(' points available')}
                  </span>
                </strong>
                <p>{c.description}</p>
                <Field id={`score-${c.id}`} label={t('Points for {value0}', { value0: c.title })}>
                  <input
                    id={`score-${c.id}`}
                    type="number"
                    min={0}
                    max={c.maxPoints}
                    required
                    value={scores[c.id] ?? 0}
                    onChange={(e) => setScores({ ...scores, [c.id]: Number(e.target.value) })}
                  />
                </Field>
              </div>
            ))}
            <Field
              id="grade-feedback"
              label={copy('feedbackText')}
              hint={t('Explain what worked, what to improve, and a useful next step.')}
            >
              <textarea
                id="grade-feedback"
                required
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                rows={6}
                maxLength={10000}
              />
            </Field>
            <label className="check-label">
              <input
                type="checkbox"
                checked={revision}
                onChange={(e) => setRevision(e.target.checked)}
              />
              {copy('revision')}
            </label>
            <Button type="submit" busy={busy} disabled={data.state !== 'SUBMITTED'}>
              {copy('saveGrade')}
            </Button>
          </FormAction>
        </section>
        <aside className="stack">
          <section className="panel">
            <h2>{t('Grade & feedback history')}</h2>
            {data.grades.length ? (
              data.grades.map((g, index) => (
                <div className="feedback-entry" key={g.id}>
                  <div className="item-header">
                    <Badge>{g.score}%</Badge>
                    <span className="field-hint">
                      {t('Grade revision ')}
                      {g.revision}
                    </span>
                  </div>
                  <p>{g.feedback}</p>
                  {g.revisionRequested ? (
                    <Badge tone="amber">{t('Revision requested')}</Badge>
                  ) : null}
                  <p className="field-hint" style={{ marginTop: 10 }}>
                    {g.releasedAt ? t('Released to learner') : copy('privateFeedback')}
                  </p>
                  {index === 0 && !g.releasedAt ? (
                    <div className="actions">
                      <Button busy={busy} onClick={() => void release(g.id)}>
                        {copy('release')}
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))
            ) : (
              <p>{t('There is no saved grade yet.')}</p>
            )}
          </section>
          <section className="panel soft">
            <h2>{t('Submission history')}</h2>
            {data.history.map((item) => (
              <div className="feedback-entry" key={item.receipt}>
                <strong>
                  {t('Revision ')}
                  {item.revision}
                </strong>
                <p>{date(item.submittedAt)}</p>
                <p className="field-hint" style={{ overflowWrap: 'anywhere' }}>
                  {item.receipt}
                </p>
              </div>
            ))}
          </section>
        </aside>
      </div>
    </>
  );
}
export function CourseReport({ id }: { id: string }) {
  const [page, setPage] = useState(1);
  const { data, loading, error } = useData<{
    course: {
      title: string;
    };
    total: number;
    page: number;
    limit: number;
    completed: number;
    notice: string;
    items: {
      enrollmentId: string;
      learner: {
        name: string;
        email: string;
      };
      state: string;
      progress: number;
      attempts: number;
      practicesPassed: number;
      submittedAssignments: number;
      releasedGrades: {
        score: number;
      }[];
    }[];
  }>(`/reporting/courses/${id}?page=${page}&limit=20`);
  return (
    <>
      <CourseLinks id={id} current="report" />
      {loading ? (
        <Loading />
      ) : error ? (
        <Alert>{error}</Alert>
      ) : data ? (
        <>
          <h2>{data.course.title}</h2>
          <div className="metric-grid">
            <div className="metric">
              <span>{t('Enrolled learners')}</span>
              <strong>{data.total}</strong>
            </div>
            <div className="metric">
              <span>{t('Course completions')}</span>
              <strong>{data.completed}</strong>
            </div>
            <div className="metric">
              <span>{t('Submitted assignments on this page')}</span>
              <strong>{data.items.reduce((n, i) => n + i.submittedAssignments, 0)}</strong>
            </div>
          </div>
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('Learner')}</th>
                  <th>{t('Completion progress')}</th>
                  <th>{t('Practice attempts')}</th>
                  <th>{t('Released grades')}</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={item.enrollmentId}>
                    <td>
                      {item.learner.name}
                      <p>{item.state.toLowerCase()}</p>
                    </td>
                    <td>
                      <Progress value={item.progress} />
                    </td>
                    <td>
                      {item.attempts}
                      {t(' attempts \u00B7 ')}
                      {item.practicesPassed}
                      {t(' passed ')}
                    </td>
                    <td>
                      {item.releasedGrades.length
                        ? item.releasedGrades.map((g) => `${g.score}%`).join(', ')
                        : t('No released grades')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={data.page}
            limit={data.limit}
            total={data.total}
            change={setPage}
            label={t('Report pages')}
          />
          <p className="settings-note" style={{ marginTop: 22 }}>
            {data.notice}
          </p>
        </>
      ) : null}
    </>
  );
}
