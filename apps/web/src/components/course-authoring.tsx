'use client';
import { t, copy } from '@/lib/i18n';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowRight,
  CheckCircle2,
  Eye,
  Plus,
  TriangleAlert,
} from 'lucide-react';
import { api, ApiError, message } from '@/lib/api';
import { downloadDocument } from '@/lib/download';
import type { Course, Criterion } from '@/lib/types';
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
  TextContent,
  useData,
} from './ui';
import { CourseLinks } from './course-navigation';
interface Question {
  kind: 'SINGLE' | 'MULTIPLE' | 'SHORT_TEXT';
  prompt: string;
  options: string[];
  answer: string[];
  explanation: string;
  points: number;
}
interface Assessment {
  maxAttempts: number;
  passPercent: number;
  feedbackRelease: string;
  deadline?: string | null;
  timeLimitMinutes?: number | null;
  questions: Question[];
}
interface EditableActivity {
  id?: string;
  title: string;
  kind: 'LESSON' | 'PRACTICE' | 'ASSIGNMENT';
  objective: string;
  body: string;
  example: string;
  reflection: string;
  estimatedMinutes: number;
  videoUrl?: string | null;
  captionsUrl?: string | null;
  transcript?: string | null;
  resources: {
    title: string;
    url?: string;
    text?: string;
    accessible: boolean;
    offlineAllowed: boolean;
  }[];
  accessibility: {
    imagesHaveAlt: boolean;
    resourcesReviewed: boolean;
    headingsReviewed: boolean;
  };
  rights: string;
  offlineAllowed: boolean;
  prerequisiteIds: string[];
  assessment?: Assessment | null;
  rubric?: {
    criteria: Criterion[];
    passPercent: number;
    deadline?: string | null;
  } | null;
}
interface Outline {
  title: string;
  description: string;
  outcomes: string[];
  prerequisites: string[];
  completionRule: string;
  modules: {
    id?: string;
    title: string;
    activities: EditableActivity[];
  }[];
  id?: string;
  number?: number;
  revision?: number;
  state?: string;
}
interface EditorResponse {
  course: Course & {
    state: string;
  };
  version: Outline | null;
  versions: {
    id: string;
    number: number;
    state: string;
  }[];
}
export function CreateCourse() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function create(event: React.FormEvent<HTMLFormElement>) {
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      const course = await api<Course>('/courses', 'POST', {
        title: String(data.get('title')),
        summary: String(data.get('summary')),
        subject: String(data.get('subject')),
        level: String(data.get('level')),
        language: String(data.get('language')),
        isPublic: data.get('public') === 'on',
      });
      router.push(`/instructor/course/${course.id}`);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel reading-width">
      <h2>{copy('courseCreate')}</h2>
      <p style={{ marginBottom: 24 }}>
        {t(
          'Start with the useful skill learners will take away. Your course begins as a private draft. ',
        )}
      </p>
      {error ? <Alert>{error}</Alert> : null}
      <FormAction onSubmit={create}>
        <Field id="new-title" label={copy('courseTitle')}>
          <input id="new-title" name="title" required minLength={3} maxLength={150} />
        </Field>
        <Field id="new-summary" label={t('Course summary')}>
          <textarea id="new-summary" name="summary" required maxLength={1000} rows={3} />
        </Field>
        <div className="form-grid">
          <Field id="new-subject" label={copy('subject')}>
            <input
              id="new-subject"
              name="subject"
              required
              defaultValue="Digital skills"
              maxLength={80}
            />
          </Field>
          <Field id="new-level" label={copy('level')}>
            <select id="new-level" name="level">
              <option value="Beginner">{t('Beginner')}</option>
              <option value="Intermediate">{t('Intermediate')}</option>
              <option value="Advanced">{t('Advanced')}</option>
            </select>
          </Field>
          <Field id="new-language" label={copy('language')}>
            <select id="new-language" name="language">
              <option value="en">{t('English')}</option>
              <option value="ti">{t('\u1275\u130D\u122D\u129B')}</option>
            </select>
          </Field>
        </div>
        <label className="check-label">
          <input type="checkbox" name="public" />
          <span>{t('List this course in the public catalog after publication.')}</span>
        </label>
        <Button type="submit" busy={busy}>
          {copy('courseCreate')}
          <ArrowRight size={18} />
        </Button>
      </FormAction>
    </section>
  );
}
function reorder<T>(items: T[], from: number, delta: number) {
  const result = [...items];
  const to = from + delta;
  if (to < 0 || to >= result.length) return result;
  [result[from], result[to]] = [result[to], result[from]];
  return result;
}
function OrderButtons({
  index,
  count,
  move,
  label,
}: {
  index: number;
  count: number;
  move: (delta: number) => void;
  label: string;
}) {
  return (
    <div className="order-buttons">
      <button
        type="button"
        disabled={index === 0}
        onClick={() => move(-1)}
        aria-label={t('Move {value0} up', { value0: label })}
      >
        <ArrowUp size={16} />
      </button>
      <button
        type="button"
        disabled={index === count - 1}
        onClick={() => move(1)}
        aria-label={t('Move {value0} down', { value0: label })}
      >
        <ArrowDown size={16} />
      </button>
    </div>
  );
}
function blankActivity(): EditableActivity {
  return {
    id: crypto.randomUUID(),
    title: t('New lesson'),
    kind: 'LESSON',
    objective: '',
    body: '',
    example: '',
    reflection: '',
    estimatedMinutes: 5,
    resources: [],
    accessibility: { imagesHaveAlt: false, resourcesReviewed: false, headingsReviewed: false },
    rights: '',
    offlineAllowed: true,
    prerequisiteIds: [],
  };
}
function blankQuestion(): Question {
  return { kind: 'SINGLE', prompt: '', options: ['', ''], answer: [], explanation: '', points: 1 };
}
function outlinePayload(outline: Outline) {
  return {
    expectedVersionId: outline.id || null,
    expectedRevision: outline.revision ?? 0,
    title: outline.title,
    description: outline.description,
    outcomes: outline.outcomes.filter((v) => v.trim()),
    prerequisites: outline.prerequisites.filter((v) => v.trim()),
    completionRule: outline.completionRule,
    modules: outline.modules.map((m) => ({
      title: m.title,
      activities: m.activities.map((a) => ({
        id: a.id,
        title: a.title,
        kind: a.kind,
        objective: a.objective,
        body: a.body,
        example: a.example,
        reflection: a.reflection,
        estimatedMinutes: a.estimatedMinutes,
        videoUrl: a.videoUrl || undefined,
        captionsUrl: a.captionsUrl || undefined,
        transcript: a.transcript || undefined,
        resources: a.resources.map((resource) => ({
          ...resource,
          url: resource.url || undefined,
          text: resource.text || undefined,
        })),
        accessibility: a.accessibility,
        rights: a.rights,
        offlineAllowed: a.offlineAllowed,
        prerequisiteIds: a.prerequisiteIds,
        ...(a.kind === 'PRACTICE' && a.assessment
          ? {
              assessment: {
                ...a.assessment,
                deadline: a.assessment.deadline || undefined,
                timeLimitMinutes: a.assessment.timeLimitMinutes || undefined,
                questions: a.assessment.questions.map((q) => ({
                  ...q,
                  options: q.options.filter((v) => v.trim()),
                  answer: q.answer.filter((v) => v.trim()),
                })),
              },
            }
          : {}),
        ...(a.kind === 'ASSIGNMENT' && a.rubric
          ? { rubric: { ...a.rubric, deadline: a.rubric.deadline || undefined } }
          : {}),
      })),
    })),
  };
}
function initialOutline(course: Course): Outline {
  return {
    title: course.title,
    description: course.summary,
    outcomes: [],
    prerequisites: [],
    completionRule: t('Complete every lesson and pass every practice and assignment.'),
    modules: [],
  };
}
export function CourseEditor({ id }: { id: string }) {
  const { data, loading, error } = useData<EditorResponse>(`/courses/${id}/editor`);
  const [outline, setOutline] = useState<Outline | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [failure, setFailure] = useState('');
  const [dirty, setDirty] = useState(false);
  const [conflict, setConflict] = useState(false);
  useEffect(() => {
    if (data) setOutline(data.version || initialOutline(data.course));
  }, [data]);
  useEffect(() => {
    if (!dirty) return;
    const protect = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', protect);
    return () => window.removeEventListener('beforeunload', protect);
  }, [dirty]);
  function change(value: Outline) {
    setOutline(value);
    setDirty(true);
    setNotice('');
  }
  async function save() {
    if (!outline) return;
    setBusy(true);
    setFailure('');
    try {
      const saved = await api<EditorResponse>(
        `/courses/${id}/outline`,
        'PUT',
        outlinePayload(outline),
      );
      setOutline(saved.version || initialOutline(saved.course));
      setDirty(false);
      setConflict(false);
      setNotice(t('Draft saved. Published versions remain unchanged.'));
    } catch (e) {
      setFailure(message(e));
      if (e instanceof ApiError && e.status === 409 && e.code === 'OUTLINE_CONFLICT')
        setConflict(true);
    } finally {
      setBusy(false);
    }
  }
  async function reloadSaved() {
    if (
      !window.confirm(
        t('Reloading replaces your unsaved edits. Download a copy first if you need to keep them.'),
      )
    )
      return;
    setBusy(true);
    try {
      const latest = await api<EditorResponse>(`/courses/${id}/editor`);
      setOutline(latest.version || initialOutline(latest.course));
      setDirty(false);
      setConflict(false);
      setFailure('');
    } catch (error) {
      setFailure(message(error));
    } finally {
      setBusy(false);
    }
  }
  if (loading) return <Loading />;
  if (error || !outline) return <Alert>{error || t('Course unavailable.')}</Alert>;
  function moduleChange(index: number, patch: Partial<Outline['modules'][number]>) {
    if (outline)
      change({
        ...outline,
        modules: outline.modules.map((m, i) => (i === index ? { ...m, ...patch } : m)),
      });
  }
  return (
    <>
      <CourseLinks id={id} current="outline" />
      {conflict ? (
        <section className="panel soft" aria-label={t('Draft conflict')}>
          <h2>{t('A newer draft was saved')}</h2>
          <p>
            {t(
              'Your edits are still here. Download a copy, then reload the latest saved draft and apply the changes you want to keep.',
            )}
          </p>
          <div className="actions">
            <Button
              secondary
              onClick={() =>
                downloadDocument(
                  'pathway-unsaved-draft.json',
                  JSON.stringify(outlinePayload(outline), null, 2),
                  'application/json',
                )
              }
            >
              {t('Download unsaved draft')}
            </Button>
            <Button secondary busy={busy} onClick={() => void reloadSaved()}>
              {t('Reload saved draft')}
            </Button>
          </div>
        </section>
      ) : null}
      <div className="editor-toolbar">
        <div>
          <h2>{outline.title}</h2>
          <p>
            {t('Version ')}
            {outline.number || 1} · {outline.state?.toLowerCase() || t('draft')} ·{' '}
            {dirty ? t('Unsaved changes') : t('All changes saved')}
          </p>
        </div>
        <div className="actions">
          <Button onClick={() => void save()} busy={busy}>
            {copy('saveDraft')}
          </Button>
          <Link className="text-link" href={`/instructor/review/${id}`}>
            {t('Review saved draft ')}
            <ArrowRight size={17} />
          </Link>
        </div>
      </div>
      {failure ? <Alert>{failure}</Alert> : null}
      {notice ? <Alert success>{notice}</Alert> : null}
      {outline.state === 'PUBLISHED' ? (
        <div className="preview-banner">
          {t(
            'Editing creates a new draft version. Current learners keep the published version they joined. ',
          )}
        </div>
      ) : null}
      <section className="editor-section">
        <h2>{t('The course at a glance')}</h2>
        <Field id="outline-title" label={copy('courseTitle')}>
          <input
            id="outline-title"
            value={outline.title}
            onChange={(e) => change({ ...outline, title: e.target.value })}
            maxLength={150}
          />
        </Field>
        <Field id="outline-description" label={copy('description')}>
          <textarea
            id="outline-description"
            value={outline.description}
            onChange={(e) => change({ ...outline, description: e.target.value })}
            rows={4}
            maxLength={5000}
          />
        </Field>
        <div className="form-grid">
          <Field
            id="outline-outcomes"
            label={copy('outcomes')}
            hint={t('One clear outcome per line.')}
          >
            <textarea
              id="outline-outcomes"
              value={outline.outcomes.join('\n')}
              onChange={(e) => change({ ...outline, outcomes: e.target.value.split('\n') })}
              rows={4}
            />
          </Field>
          <Field
            id="outline-prerequisites"
            label={copy('prerequisites')}
            hint={t('One prerequisite per line. Leave blank if none.')}
          >
            <textarea
              id="outline-prerequisites"
              value={outline.prerequisites.join('\n')}
              onChange={(e) => change({ ...outline, prerequisites: e.target.value.split('\n') })}
              rows={4}
            />
          </Field>
        </div>
        <Field id="completion-rule" label={t('Completion rules')}>
          <textarea
            id="completion-rule"
            value={outline.completionRule}
            onChange={(e) => change({ ...outline, completionRule: e.target.value })}
            rows={2}
            maxLength={1000}
          />
        </Field>
      </section>
      {outline.modules.map((module, mi) => (
        <section className="editor-module" key={module.id || mi}>
          <div className="editor-module-header">
            <span className="module-number">{String(mi + 1).padStart(2, '0')}</span>
            <Field id={`module-${mi}`} label={copy('moduleTitle')}>
              <input
                id={`module-${mi}`}
                value={module.title}
                onChange={(e) => moduleChange(mi, { title: e.target.value })}
                maxLength={200}
              />
            </Field>
            <OrderButtons
              index={mi}
              count={outline.modules.length}
              label={module.title}
              move={(delta) => change({ ...outline, modules: reorder(outline.modules, mi, delta) })}
            />
          </div>
          {module.activities.map((activity, ai) => (
            <ActivityEditor
              key={activity.id || ai}
              activity={activity}
              id={`activity-${mi}-${ai}`}
              allActivities={outline.modules.flatMap((m) => m.activities)}
              update={(value) =>
                moduleChange(mi, {
                  activities: module.activities.map((a, i) => (i === ai ? value : a)),
                })
              }
              order={
                <OrderButtons
                  index={ai}
                  count={module.activities.length}
                  label={activity.title}
                  move={(delta) =>
                    moduleChange(mi, { activities: reorder(module.activities, ai, delta) })
                  }
                />
              }
              remove={() =>
                moduleChange(mi, { activities: module.activities.filter((_, i) => i !== ai) })
              }
            />
          ))}
          <div className="actions">
            <Button
              secondary
              onClick={() =>
                moduleChange(mi, { activities: [...module.activities, blankActivity()] })
              }
            >
              <Plus size={17} />
              {copy('addActivity')}
            </Button>
            <button
              type="button"
              className="text-button"
              onClick={() =>
                change({ ...outline, modules: outline.modules.filter((_, i) => i !== mi) })
              }
            >
              {t('Remove module ')}
            </button>
          </div>
        </section>
      ))}
      <div className="actions">
        <Button
          secondary
          onClick={() =>
            change({
              ...outline,
              modules: [
                ...outline.modules,
                { id: crypto.randomUUID(), title: t('New module'), activities: [] },
              ],
            })
          }
        >
          <Plus size={17} />
          {copy('addModule')}
        </Button>
        <Button busy={busy} onClick={() => void save()}>
          {copy('saveDraft')}
        </Button>
      </div>
    </>
  );
}
function ActivityEditor({
  activity: a,
  id,
  update,
  allActivities,
  order,
  remove,
}: {
  activity: EditableActivity;
  id: string;
  update: (value: EditableActivity) => void;
  allActivities: EditableActivity[];
  order: React.ReactNode;
  remove: () => void;
}) {
  function set<K extends keyof EditableActivity>(key: K, value: EditableActivity[K]) {
    update({ ...a, [key]: value });
  }
  function kind(kind: EditableActivity['kind']) {
    update({
      ...a,
      kind,
      ...(kind === 'PRACTICE' && !a.assessment
        ? {
            assessment: {
              maxAttempts: 3,
              passPercent: 70,
              feedbackRelease: 'AFTER_SUBMIT',
              questions: [blankQuestion()],
            },
          }
        : {}),
      ...(kind === 'ASSIGNMENT' && !a.rubric
        ? {
            rubric: {
              passPercent: 70,
              criteria: [
                {
                  id: crypto.randomUUID(),
                  title: t('Demonstration'),
                  description: t('Demonstrates the skill described in the objective.'),
                  maxPoints: 10,
                },
              ],
            },
          }
        : {}),
    });
  }
  return (
    <details className="activity-editor">
      <summary>
        <span>{a.title || t('Untitled activity')}</span>
        <Badge tone="neutral">{a.kind.toLowerCase()}</Badge>
      </summary>
      <div className="activity-editor-body">
        <div className="editor-toolbar">
          <p>{t('Accessible order controls')}</p>
          {order}
        </div>
        <div className="form-grid">
          <Field id={`${id}-title`} label={copy('activityTitle')}>
            <input
              id={`${id}-title`}
              value={a.title}
              maxLength={200}
              onChange={(e) => set('title', e.target.value)}
            />
          </Field>
          <Field id={`${id}-kind`} label={copy('activityType')}>
            <select
              id={`${id}-kind`}
              value={a.kind}
              onChange={(e) => kind(e.target.value as EditableActivity['kind'])}
            >
              <option value="LESSON">{t('Lesson')}</option>
              <option value="PRACTICE">{t('Practice')}</option>
              <option value="ASSIGNMENT">{t('Assignment')}</option>
            </select>
          </Field>
        </div>
        <Field id={`${id}-objective`} label={t('Learning objective')}>
          <textarea
            id={`${id}-objective`}
            value={a.objective}
            maxLength={2000}
            rows={2}
            onChange={(e) => set('objective', e.target.value)}
          />
        </Field>
        <Field
          id={`${id}-body`}
          label={copy('content')}
          hint={t('Use blank lines between paragraphs, ## for headings, and - for list items.')}
        >
          <textarea
            id={`${id}-body`}
            value={a.body}
            maxLength={50000}
            rows={8}
            onChange={(e) => set('body', e.target.value)}
          />
        </Field>
        <div className="form-grid">
          <Field id={`${id}-example`} label={copy('example')}>
            <textarea
              id={`${id}-example`}
              value={a.example || ''}
              maxLength={10000}
              rows={4}
              onChange={(e) => set('example', e.target.value)}
            />
          </Field>
          <Field id={`${id}-reflection`} label={copy('reflection')}>
            <textarea
              id={`${id}-reflection`}
              value={a.reflection || ''}
              maxLength={3000}
              rows={4}
              onChange={(e) => set('reflection', e.target.value)}
            />
          </Field>
          <Field id={`${id}-minutes`} label={copy('effortMinutes')}>
            <input
              id={`${id}-minutes`}
              type="number"
              min={1}
              max={600}
              value={a.estimatedMinutes}
              onChange={(e) => set('estimatedMinutes', Number(e.target.value))}
            />
          </Field>
          <Field
            id={`${id}-prerequisites`}
            label={t('Required activities before this step')}
            hint={t('Select one or more with Ctrl / Command. Cycles are rejected when saving.')}
          >
            <select
              id={`${id}-prerequisites`}
              multiple
              value={a.prerequisiteIds}
              onChange={(e) =>
                set(
                  'prerequisiteIds',
                  Array.from(e.target.selectedOptions).map((o) => o.value),
                )
              }
            >
              {allActivities
                .filter((other) => other.id !== a.id && other.id)
                .map((other) => (
                  <option key={other.id} value={other.id}>
                    {other.title}
                  </option>
                ))}
            </select>
          </Field>
        </div>
        <details className="subsection">
          <summary>{t('Video, captions & transcript')}</summary>
          <div style={{ marginTop: 18 }}>
            <Field id={`${id}-video`} label={t('Video URL (HTTPS)')}>
              <input
                id={`${id}-video`}
                type="url"
                value={a.videoUrl || ''}
                onChange={(e) => set('videoUrl', e.target.value)}
              />
            </Field>
            <Field id={`${id}-captions`} label={t('Captions URL (WebVTT, HTTPS)')}>
              <input
                id={`${id}-captions`}
                type="url"
                value={a.captionsUrl || ''}
                onChange={(e) => set('captionsUrl', e.target.value)}
              />
            </Field>
            <Field id={`${id}-transcript`} label={copy('transcript')}>
              <textarea
                id={`${id}-transcript`}
                value={a.transcript || ''}
                onChange={(e) => set('transcript', e.target.value)}
                rows={5}
                maxLength={50000}
              />
            </Field>
          </div>
        </details>
        {a.kind === 'PRACTICE' && a.assessment ? (
          <AssessmentEditor
            id={id}
            value={a.assessment}
            update={(value) => set('assessment', value)}
          />
        ) : null}
        {a.kind === 'ASSIGNMENT' && a.rubric ? (
          <RubricEditor id={id} value={a.rubric} update={(value) => set('rubric', value)} />
        ) : null}
        <section className="subsection">
          <h3>{copy('resources')}</h3>
          {a.resources.map((resource, index) => (
            <div className="mini-panel" key={index}>
              <Field id={`${id}-resource-${index}-title`} label={t('Resource title')}>
                <input
                  id={`${id}-resource-${index}-title`}
                  value={resource.title}
                  maxLength={200}
                  onChange={(e) =>
                    set(
                      'resources',
                      a.resources.map((r, i) =>
                        i === index ? { ...r, title: e.target.value } : r,
                      ),
                    )
                  }
                />
              </Field>
              <Field id={`${id}-resource-${index}-url`} label={t('Resource URL (HTTPS)')}>
                <input
                  id={`${id}-resource-${index}-url`}
                  type="url"
                  value={resource.url || ''}
                  onChange={(e) =>
                    set(
                      'resources',
                      a.resources.map((r, i) => (i === index ? { ...r, url: e.target.value } : r)),
                    )
                  }
                />
              </Field>
              <Field
                id={`${id}-resource-${index}-text`}
                label={copy('resourceText')}
                hint={copy('resourceTextHint')}
              >
                <textarea
                  id={`${id}-resource-${index}-text`}
                  rows={6}
                  maxLength={50000}
                  value={resource.text || ''}
                  onChange={(event) =>
                    set(
                      'resources',
                      a.resources.map((item, position) =>
                        position === index ? { ...item, text: event.target.value } : item,
                      ),
                    )
                  }
                />
              </Field>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={resource.accessible}
                  onChange={(e) =>
                    set(
                      'resources',
                      a.resources.map((r, i) =>
                        i === index ? { ...r, accessible: e.target.checked } : r,
                      ),
                    )
                  }
                />
                {t('This resource has been checked for accessibility ')}
              </label>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={resource.offlineAllowed}
                  onChange={(e) =>
                    set(
                      'resources',
                      a.resources.map((r, i) =>
                        i === index ? { ...r, offlineAllowed: e.target.checked } : r,
                      ),
                    )
                  }
                />
                {copy('resourceOffline')}
              </label>
              <button
                type="button"
                className="text-button"
                onClick={() =>
                  set(
                    'resources',
                    a.resources.filter((_, i) => i !== index),
                  )
                }
              >
                {t('Remove resource ')}
              </button>
            </div>
          ))}
          <Button
            secondary
            onClick={() =>
              set('resources', [
                ...a.resources,
                { title: '', url: '', accessible: false, offlineAllowed: false },
              ])
            }
          >
            <Plus size={16} />
            {t('Add resource ')}
          </Button>
        </section>
        <section className="subsection">
          <h3>{t('Accessibility & rights review')}</h3>
          <Field
            id={`${id}-rights`}
            label={copy('rights')}
            hint={t('For example: Original content by your organization, or source and license.')}
          >
            <input
              id={`${id}-rights`}
              value={a.rights}
              maxLength={500}
              onChange={(e) => set('rights', e.target.value)}
            />
          </Field>
          {(
            [
              ['imagesHaveAlt', t('Images have meaningful alternatives (or no images are used).')],
              ['resourcesReviewed', t('Documents and resources have been reviewed.')],
              ['headingsReviewed', t('Headings, reading order, and instructions are clear.')],
            ] as const
          ).map(([key, label]) => (
            <label className="check-label" key={key}>
              <input
                type="checkbox"
                checked={a.accessibility[key]}
                onChange={(e) =>
                  set('accessibility', { ...a.accessibility, [key]: e.target.checked })
                }
              />
              {label}
            </label>
          ))}
          {a.kind === 'LESSON' ? (
            <label className="check-label">
              <input
                type="checkbox"
                checked={a.offlineAllowed}
                onChange={(e) => set('offlineAllowed', e.target.checked)}
              />
              {t('Allow this text lesson to be downloaded ')}
            </label>
          ) : null}
        </section>
        <div className="actions">
          <button type="button" className="remove-button" onClick={remove}>
            {t('Remove this activity from draft ')}
          </button>
        </div>
      </div>
    </details>
  );
}
function AssessmentEditor({
  id,
  value,
  update,
}: {
  id: string;
  value: Assessment;
  update: (value: Assessment) => void;
}) {
  function question(index: number, patch: Partial<Question>) {
    update({
      ...value,
      questions: value.questions.map((q, i) => (i === index ? { ...q, ...patch } : q)),
    });
  }
  return (
    <section className="subsection">
      <h3>{t('Practice & feedback rules')}</h3>
      <div className="form-grid">
        <Field id={`${id}-attempts`} label={t('Maximum attempts')}>
          <input
            id={`${id}-attempts`}
            type="number"
            min={1}
            max={50}
            value={value.maxAttempts}
            onChange={(e) => update({ ...value, maxAttempts: Number(e.target.value) })}
          />
        </Field>
        <Field id={`${id}-pass`} label={t('Passing percentage')}>
          <input
            id={`${id}-pass`}
            type="number"
            min={1}
            max={100}
            value={value.passPercent}
            onChange={(e) => update({ ...value, passPercent: Number(e.target.value) })}
          />
        </Field>
        <Field id={`${id}-release`} label={t('Detailed feedback release')}>
          <select
            id={`${id}-release`}
            value={value.feedbackRelease}
            onChange={(e) => update({ ...value, feedbackRelease: e.target.value })}
          >
            <option value="AFTER_SUBMIT">{t('After submitting')}</option>
            <option value="AFTER_DEADLINE">{t('After deadline')}</option>
            <option value="NEVER">{t('Do not release answer keys')}</option>
          </select>
        </Field>
        <Field id={`${id}-deadline`} label={t('Deadline (optional, UTC)')}>
          <input
            id={`${id}-deadline`}
            type="datetime-local"
            value={value.deadline?.slice(0, 16) || ''}
            onChange={(e) =>
              update({
                ...value,
                deadline: e.target.value ? `${e.target.value}:00.000Z` : undefined,
              })
            }
          />
        </Field>
        <Field id={`${id}-time-limit`} label={t('Time limit in minutes (optional)')}>
          <input
            id={`${id}-time-limit`}
            type="number"
            min={1}
            max={480}
            value={value.timeLimitMinutes || ''}
            onChange={(e) =>
              update({
                ...value,
                timeLimitMinutes: e.target.value ? Number(e.target.value) : undefined,
              })
            }
          />
        </Field>
      </div>
      {value.questions.map((q, index) => (
        <div className="mini-panel" key={index}>
          <h4 style={{ marginBottom: 17 }}>
            {t('Question ')}
            {index + 1}
          </h4>
          <Field id={`${id}-q-${index}-kind`} label={t('Question type')}>
            <select
              id={`${id}-q-${index}-kind`}
              value={q.kind}
              onChange={(e) => question(index, { kind: e.target.value as Question['kind'] })}
            >
              <option value="SINGLE">{t('Single choice')}</option>
              <option value="MULTIPLE">{t('Multiple choice')}</option>
              <option value="SHORT_TEXT">{t('Short text')}</option>
            </select>
          </Field>
          <Field id={`${id}-q-${index}-prompt`} label={t('Question')}>
            <textarea
              id={`${id}-q-${index}-prompt`}
              value={q.prompt}
              onChange={(e) => question(index, { prompt: e.target.value })}
              maxLength={2000}
              rows={2}
            />
          </Field>
          {q.kind !== 'SHORT_TEXT' ? (
            <Field
              id={`${id}-q-${index}-options`}
              label={t('Answer options')}
              hint={t('One option per line.')}
            >
              <textarea
                id={`${id}-q-${index}-options`}
                value={q.options.join('\n')}
                onChange={(e) => question(index, { options: e.target.value.split('\n') })}
                rows={4}
              />
            </Field>
          ) : null}
          <Field
            id={`${id}-q-${index}-answer`}
            label={q.kind === 'SHORT_TEXT' ? t('Accepted answers') : t('Correct options')}
            hint={
              q.kind === 'SHORT_TEXT'
                ? t(
                    'One accepted answer per line. Matching ignores case and surrounding whitespace.',
                  )
                : t('Copy the exact option text, one correct option per line.')
            }
          >
            <textarea
              id={`${id}-q-${index}-answer`}
              value={q.answer.join('\n')}
              onChange={(e) => question(index, { answer: e.target.value.split('\n') })}
              rows={2}
            />
          </Field>
          <Field id={`${id}-q-${index}-feedback`} label={t('Explanation')}>
            <textarea
              id={`${id}-q-${index}-feedback`}
              value={q.explanation}
              onChange={(e) => question(index, { explanation: e.target.value })}
              maxLength={2000}
              rows={3}
            />
          </Field>
          <Field id={`${id}-q-${index}-points`} label={t('Points')}>
            <input
              id={`${id}-q-${index}-points`}
              type="number"
              min={1}
              max={100}
              value={q.points}
              onChange={(e) => question(index, { points: Number(e.target.value) })}
            />
          </Field>
          <button
            type="button"
            className="text-button"
            onClick={() =>
              update({ ...value, questions: value.questions.filter((_, i) => i !== index) })
            }
          >
            {t('Remove question ')}
          </button>
        </div>
      ))}
      <Button
        secondary
        onClick={() => update({ ...value, questions: [...value.questions, blankQuestion()] })}
      >
        <Plus size={16} />
        {t('Add question ')}
      </Button>
    </section>
  );
}
function RubricEditor({
  id,
  value,
  update,
}: {
  id: string;
  value: NonNullable<EditableActivity['rubric']>;
  update: (value: NonNullable<EditableActivity['rubric']>) => void;
}) {
  function criterion(index: number, patch: Partial<Criterion>) {
    update({
      ...value,
      criteria: value.criteria.map((c, i) => (i === index ? { ...c, ...patch } : c)),
    });
  }
  return (
    <section className="subsection">
      <h3>{t('Assignment rubric')}</h3>
      <div className="form-grid">
        <Field id={`${id}-rubric-pass`} label={t('Passing percentage')}>
          <input
            id={`${id}-rubric-pass`}
            type="number"
            min={1}
            max={100}
            value={value.passPercent}
            onChange={(e) => update({ ...value, passPercent: Number(e.target.value) })}
          />
        </Field>
        <Field id={`${id}-rubric-deadline`} label={t('Deadline (optional, UTC)')}>
          <input
            id={`${id}-rubric-deadline`}
            type="datetime-local"
            value={value.deadline?.slice(0, 16) || ''}
            onChange={(e) =>
              update({
                ...value,
                deadline: e.target.value ? `${e.target.value}:00.000Z` : undefined,
              })
            }
          />
        </Field>
      </div>
      {value.criteria.map((c, index) => (
        <div className="mini-panel" key={c.id}>
          <Field id={`${id}-criterion-${index}`} label={t('Criterion title')}>
            <input
              id={`${id}-criterion-${index}`}
              value={c.title}
              maxLength={150}
              onChange={(e) => criterion(index, { title: e.target.value })}
            />
          </Field>
          <Field
            id={`${id}-criterion-desc-${index}`}
            label={t('What successful work demonstrates')}
          >
            <textarea
              id={`${id}-criterion-desc-${index}`}
              value={c.description}
              rows={2}
              maxLength={1000}
              onChange={(e) => criterion(index, { description: e.target.value })}
            />
          </Field>
          <Field id={`${id}-criterion-max-${index}`} label={t('Maximum points')}>
            <input
              id={`${id}-criterion-max-${index}`}
              type="number"
              min={1}
              max={100}
              value={c.maxPoints}
              onChange={(e) => criterion(index, { maxPoints: Number(e.target.value) })}
            />
          </Field>
          <button
            type="button"
            className="text-button"
            onClick={() =>
              update({ ...value, criteria: value.criteria.filter((_, i) => i !== index) })
            }
          >
            {t('Remove criterion ')}
          </button>
        </div>
      ))}
      <Button
        secondary
        onClick={() =>
          update({
            ...value,
            criteria: [
              ...value.criteria,
              { id: crypto.randomUUID(), title: '', description: '', maxPoints: 10 },
            ],
          })
        }
      >
        <Plus size={16} />
        {t('Add criterion ')}
      </Button>
    </section>
  );
}
export function Preview({ id }: { id: string }) {
  const { data, loading, error } = useData<EditorResponse>(`/courses/${id}/editor`);
  const [selected, setSelected] = useState(0);
  if (loading) return <Loading />;
  if (error || !data) return <Alert>{error}</Alert>;
  const version = data.version || initialOutline(data.course);
  const activities = version.modules.flatMap((m) => m.activities);
  const a = activities[selected];
  return (
    <>
      <CourseLinks id={id} current="preview" />
      <div className="preview-banner">
        <Eye size={18} style={{ verticalAlign: 'middle', marginRight: 8 }} />
        {t(
          'Preview of the last saved draft. This reading preview never creates attempts, grades, enrollments, or progress. ',
        )}
      </div>
      <PageHeading title={version.title} description={version.description} />
      <div className="lesson-layout">
        <article className="lesson-content">
          {a ? (
            <>
              <p className="eyebrow">
                {a.kind} · {a.estimatedMinutes}
                {t(' MIN ')}
              </p>
              <h2 style={{ margin: '13px 0' }}>{a.title}</h2>
              <p className="lede" style={{ marginBottom: 25 }}>
                {a.objective}
              </p>
              <TextContent text={a.body} />
              {a.example ? (
                <section className="worked-example">
                  <h3>{t('Worked example')}</h3>
                  <TextContent text={a.example} />
                </section>
              ) : null}
              {a.assessment ? (
                <section>
                  <h3>{t('Practice preview')}</h3>
                  {a.assessment.questions.map((q, i) => (
                    <div className="mini-panel" key={i}>
                      <strong>
                        {i + 1}. {q.prompt}
                      </strong>
                      {q.options.length ? (
                        <ul>
                          {q.options.map((o, j) => (
                            <li key={j}>{o}</li>
                          ))}
                        </ul>
                      ) : (
                        <p>{t('Short-text response')}</p>
                      )}
                    </div>
                  ))}
                </section>
              ) : null}
              {a.rubric ? (
                <section>
                  <h3>{t('Rubric preview')}</h3>
                  {a.rubric.criteria.map((c) => (
                    <div className="rubric-item" key={c.id}>
                      <strong>
                        {c.title}
                        <span>
                          {c.maxPoints}
                          {t(' points')}
                        </span>
                      </strong>
                      <p>{c.description}</p>
                    </div>
                  ))}
                </section>
              ) : null}
              {a.reflection ? (
                <section className="reflection">
                  <div>
                    <h3>{t('Pause & reflect')}</h3>
                    <p>{a.reflection}</p>
                  </div>
                </section>
              ) : null}
              <div className="actions">
                <Button
                  secondary
                  disabled={selected === 0}
                  onClick={() => setSelected(selected - 1)}
                >
                  {t('Previous activity ')}
                </Button>
                <Button
                  disabled={selected >= activities.length - 1}
                  onClick={() => setSelected(selected + 1)}
                >
                  {t('Next activity ')}
                </Button>
              </div>
            </>
          ) : (
            <Empty title={t('Add an activity to preview this course.')} />
          )}
        </article>
        <aside className="panel">
          <h2>{t('Course outline')}</h2>
          {activities.map((item, i) => (
            <button
              key={item.id || i}
              className="text-button"
              style={{
                display: 'flex',
                width: '100%',
                textAlign: 'left',
                justifyContent: 'flex-start',
                background: selected === i ? '#e4f2ed' : undefined,
              }}
              onClick={() => setSelected(i)}
              aria-current={selected === i ? 'step' : undefined}
            >
              {i + 1}. {item.title}
            </button>
          ))}
        </aside>
      </div>
    </>
  );
}
export function Publication({ id }: { id: string }) {
  const { data, loading, error, reload } = useData<{
    state: string;
    canPublish: boolean;
    issues: string[];
    completionPreview: string;
  }>(`/courses/${id}/review`);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [failure, setFailure] = useState('');
  async function action(type: string) {
    setBusy(true);
    setFailure('');
    try {
      await api(`/courses/${id}/${type}`, 'POST', {});
      setNotice(
        type === 'publish'
          ? t('Course published. New learners can join this immutable version.')
          : type === 'archive'
            ? t('Course archived. Existing enrolled learners retain their course version.')
            : t('Draft sent for review.'),
      );
      reload();
    } catch (e) {
      setFailure(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <CourseLinks id={id} current="review" />
      {loading ? (
        <Loading />
      ) : error ? (
        <Alert>{error}</Alert>
      ) : data ? (
        <section className="panel reading-width">
          <h2>{t('Ready for a learner\u2019s next step?')}</h2>
          <p>
            {t(
              'Review the saved content, accessibility, assessment configuration, and rights before publication. ',
            )}
          </p>
          {failure ? <Alert>{failure}</Alert> : null}
          {notice ? <Alert success>{notice}</Alert> : null}
          <div style={{ margin: '25px 0' }}>
            {data.issues.length ? (
              data.issues.map((issue, index) => (
                <div className="review-check issue" key={index}>
                  <TriangleAlert size={20} />
                  {issue}
                </div>
              ))
            ) : (
              <div className="review-check">
                <CheckCircle2 size={21} />
                {t(
                  'The automated publication checks pass. Confirm the saved learner preview has been reviewed by an educator. ',
                )}
              </div>
            )}
          </div>
          <div className="settings-note">
            <strong>{t('Completion rule preview')}</strong>
            <p style={{ marginTop: 8 }}>{data.completionPreview}</p>
          </div>
          <div className="actions">
            <LinkButton secondary href={`/instructor/preview/${id}`}>
              {t('Open learner preview ')}
            </LinkButton>
            {data.state === 'DRAFT' ? (
              <Button secondary busy={busy} onClick={() => void action('review')}>
                {t('Mark ready for review ')}
              </Button>
            ) : null}
            <Button
              busy={busy}
              disabled={!data.canPublish || data.state === 'PUBLISHED'}
              onClick={() => void action('publish')}
            >
              {data.state === 'PUBLISHED' ? t('Published') : copy('publish')}
            </Button>
          </div>
          <p className="field-hint" style={{ marginTop: 20 }}>
            {t(
              'Published content is versioned. Editing later creates a draft and leaves existing learner attempts unchanged. ',
            )}
          </p>
          {data.state === 'PUBLISHED' ? (
            <details style={{ marginTop: 25 }}>
              <summary>{t('Course availability')}</summary>
              <p style={{ marginTop: 15 }}>
                {t('Archiving removes the course from discovery and prevents new enrollment. ')}
              </p>
              <div className="actions">
                <Button secondary busy={busy} onClick={() => void action('archive')}>
                  {t('Archive course ')}
                </Button>
              </div>
            </details>
          ) : null}
        </section>
      ) : null}
    </>
  );
}
