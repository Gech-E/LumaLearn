'use client';
import { t, copy, date } from '@/lib/i18n';
import Link from 'next/link';
import { useState } from 'react';
import { RefreshCw, Search, ShieldCheck } from 'lucide-react';
import { api, message } from '@/lib/api';
import type { Course, Page, Ticket } from '@/lib/types';
import { useApp } from './application';
import { MfaSetup } from './account';
import { Pagination } from './pagination';
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
  useData,
} from './ui';
type ManagedUser = {
  id: string;
  name: string;
  email: string;
  verified: boolean;
  membershipId: string;
  state: string;
  roles: string[];
};
type Audit = {
  id: string;
  actorId: string;
  action: string;
  objectId: string;
  createdAt: string;
};
type Job = {
  id: string;
  type: string;
  status: string;
  attempts: number;
  lastError: string | null;
  createdAt: string;
};
const roleLabels: Record<string, string> = {
  LEARNER: t('Learner'),
  INSTRUCTOR: t('Instructor'),
  ADMIN: t('Organization administrator'),
  SUPPORT: t('Support'),
  ACADEMIC_ADMIN: t('Academic records administrator'),
};
export function Admin({ path }: { path: string[] }) {
  const { user } = useApp();
  const administrator = !!user?.roles.includes('ADMIN');
  if (!administrator && !user?.roles.includes('SUPPORT'))
    return <Alert>{copy('permission')}</Alert>;
  if (!user?.mfaEnabled)
    return (
      <>
        <PageHeading
          title={copy('finishMfa')}
          description={t('Protect management access with an authenticator app.')}
        />
        <MfaSetup />
      </>
    );
  const section = path[0] || (administrator ? 'users' : 'support');
  const tabs = administrator
    ? [
        ['users', t('Users & memberships')],
        ['courses', t('Courses & enrollment')],
        ['support', t('Help requests')],
        ['notices', t('Service notices')],
        ['audit', t('Audit log')],
        ['jobs', t('Background jobs')],
        ['settings', t('Settings')],
      ]
    : [['support', t('Help requests')]];
  return (
    <>
      <PageHeading
        eyebrow={t('ORGANIZATION WORKSPACE')}
        title={administrator ? t('Care for your learning community.') : t('A helpful next step.')}
        description={
          administrator
            ? t('Manage access, course availability, and essential service information.')
            : t('Respond to private help requests within your organization.')
        }
      />
      <nav className="workspace-tabs" aria-label={t('Administration navigation')}>
        {tabs.map(([key, title]) => (
          <Link
            key={key}
            href={`/admin/${key}`}
            aria-current={section === key ? 'page' : undefined}
          >
            {title}
          </Link>
        ))}
      </nav>
      {section === 'support' ? (
        <SupportQueue />
      ) : !administrator ? (
        <Alert>{copy('permission')}</Alert>
      ) : section === 'users' ? (
        <Users />
      ) : section === 'courses' ? (
        <ManagedCourses />
      ) : section === 'notices' ? (
        <ServiceNotice />
      ) : section === 'audit' ? (
        <AuditLog />
      ) : section === 'jobs' ? (
        <Jobs />
      ) : section === 'settings' ? (
        <Settings />
      ) : (
        <Empty title={t('This management page is unavailable.')}>
          <LinkButton href="/admin">{t('Open administration')}</LinkButton>
        </Empty>
      )}
    </>
  );
}
function Users() {
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useData<Page<ManagedUser>>(
    `/users?page=${page}&limit=20&q=${encodeURIComponent(search)}`,
  );
  return (
    <section>
      <div className="section-heading">
        <div>
          <h2>{t('Users & memberships')}</h2>
          <p>{t('Changes to membership or roles revoke the person\u2019s existing sessions.')}</p>
        </div>
        <Button secondary onClick={reload}>
          <RefreshCw size={17} />
          {t(' Refresh ')}
        </Button>
      </div>
      <FormAction
        className="catalog-filters"
        onSubmit={() => {
          setSearch(query.trim());
          setPage(1);
        }}
      >
        <Field id="users-search" label={t('Search organization users')}>
          <div className="search-field">
            <Search size={20} />
            <input
              id="users-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              maxLength={100}
              placeholder={t('Name or email')}
            />
            <Button type="submit">{t('Search')}</Button>
          </div>
        </Field>
      </FormAction>
      {error ? <Alert>{error}</Alert> : null}
      {loading ? (
        <Loading />
      ) : data?.items.length ? (
        <>
          {data.items.map((item) => (
            <MembershipEditor
              key={`${item.id}-${item.state}-${item.roles.join(',')}`}
              item={item}
              changed={reload}
            />
          ))}
          <Pagination page={page} total={data.total} change={setPage} />
        </>
      ) : (
        <Empty
          title={t('No users match this search.')}
          description={t('Try a different name or email.')}
        />
      )}
    </section>
  );
}
function MembershipEditor({ item, changed }: { item: ManagedUser; changed: () => void }) {
  const { user } = useApp();
  const [state, setState] = useState(item.state);
  const [roles, setRoles] = useState(item.roles);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const self = user?.id === item.id;
  const academic = !!user?.roles.includes('ACADEMIC_ADMIN');
  const protectedMembership = item.roles.includes('ACADEMIC_ADMIN') && !academic;
  async function save() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await api<{
        message: string;
      }>(`/memberships/${item.membershipId}`, 'PATCH', {
        state,
        roles,
      });
      setNotice(result.message);
      changed();
    } catch (failure) {
      setError(message(failure));
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="ticket">
      <summary className="member-summary">
        <span>
          <strong>{item.name}</strong>
          <span className="field-hint">{item.email}</span>
        </span>
        <Badge tone={item.state === 'ACTIVE' ? 'green' : 'amber'}>{item.state.toLowerCase()}</Badge>
      </summary>
      <div className="member-details">
        <p>
          {item.verified ? t('Contact verified') : t('Contact not verified')}
          {t(' \u00B7 User ID:')} <code className="record-id">{item.id}</code>
        </p>
        <p>{item.roles.map((role) => roleLabels[role] || role).join(', ')}</p>
        {error ? <Alert>{error}</Alert> : null}
        {notice ? <Alert success>{notice}</Alert> : null}
        {self || protectedMembership ? (
          <p className="settings-note">
            {self
              ? t('Ask another administrator to update your own membership.')
              : t('An administrator with academic record permission must manage this membership.')}
          </p>
        ) : (
          <FormAction onSubmit={save}>
            <Field id={`state-${item.id}`} label={t('Membership state')}>
              <select
                id={`state-${item.id}`}
                value={state}
                onChange={(event) => setState(event.target.value)}
              >
                <option value="ACTIVE">{t('Active')}</option>
                <option value="SUSPENDED">{t('Suspended')}</option>
                <option value="WITHDRAWN">{t('Withdrawn')}</option>
              </select>
            </Field>
            <fieldset className="role-options">
              <legend>{t('Roles')}</legend>
              {Object.entries(roleLabels)
                .filter(([role]) => role !== 'ACADEMIC_ADMIN' || academic)
                .map(([role, label]) => (
                  <label className="check-label" key={role}>
                    <input
                      type="checkbox"
                      checked={roles.includes(role)}
                      onChange={(event) =>
                        setRoles((current) =>
                          event.target.checked
                            ? [...current, role]
                            : current.filter((value) => value !== role),
                        )
                      }
                    />
                    <span>{label}</span>
                  </label>
                ))}
            </fieldset>
            <p className="field-hint">
              {t(
                'Organization administration does not grant academic record access. Keep roles limited to the person\u2019s responsibilities. ',
              )}
            </p>
            <div className="actions">
              <Button type="submit" busy={busy} disabled={!roles.length}>
                {t('Save membership ')}
              </Button>
            </div>
          </FormAction>
        )}
      </div>
    </details>
  );
}
function ManagedCourses() {
  const { data, loading, error } = useData<
    Page<
      Course & {
        state: string;
        enrollmentCount: number;
      }
    >
  >('/courses/assigned');
  if (loading) return <Loading />;
  if (error) return <Alert>{error}</Alert>;
  return (
    <section>
      <div className="section-heading">
        <div>
          <h2>{t('Courses & enrollment')}</h2>
          <p>{t('Course content and learner enrollment stay within this organization.')}</p>
        </div>
        <LinkButton href="/instructor/new">{t('Create a course')}</LinkButton>
      </div>
      {data?.items.length ? (
        <div className="stack">
          {data.items.map((course) => (
            <article className="panel" key={course.id}>
              <div className="item-header">
                <h3>{course.title}</h3>
                <Badge tone={course.state === 'PUBLISHED' ? 'green' : 'amber'}>
                  {course.state.toLowerCase()}
                </Badge>
              </div>
              <p>{course.summary}</p>
              <p className="field-hint">
                {course.enrollmentCount}
                {t(' learners enrolled')}
              </p>
              <div className="actions">
                <LinkButton href={`/instructor/enrollments/${course.id}`}>
                  {t('Manage enrollment ')}
                </LinkButton>
                <LinkButton secondary href={`/instructor/course/${course.id}`}>
                  {t('Edit course ')}
                </LinkButton>
                <Link href={`/instructor/review/${course.id}`} className="text-link">
                  {t('Publication & availability ')}
                </Link>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title={t('No courses yet.')}
          description={t('Create the first course and review it before publication.')}
        />
      )}
    </section>
  );
}
function SupportQueue() {
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useData<
    Page<
      Ticket & {
        userId: string;
      }
    >
  >(`/support?page=${page}&limit=20`);
  return (
    <section>
      <div className="section-heading">
        <div>
          <h2>{t('Private help requests')}</h2>
          <p>{t('Access and responses are recorded in the organization audit log.')}</p>
        </div>
        <Button secondary onClick={reload}>
          <RefreshCw size={17} />
          {t(' Refresh ')}
        </Button>
      </div>
      {error ? <Alert>{error}</Alert> : null}
      {loading ? (
        <Loading />
      ) : data?.items.length ? (
        <>
          {data.items.map((ticket) => (
            <TicketResponse
              key={`${ticket.id}-${ticket.status}-${ticket.response}`}
              ticket={ticket}
              changed={reload}
            />
          ))}
          <Pagination page={page} total={data.total} change={setPage} />
        </>
      ) : (
        <Empty
          title={t('There are no help requests.')}
          description={t('New requests will appear here when a learner asks for help.')}
        />
      )}
    </section>
  );
}
function TicketResponse({
  ticket,
  changed,
}: {
  ticket: Ticket & {
    userId: string;
  };
  changed: () => void;
}) {
  const { user } = useApp();
  const [response, setResponse] = useState(ticket.response || '');
  const [status, setStatus] = useState(ticket.status);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save() {
    setBusy(true);
    setError('');
    try {
      await api(`/support/${ticket.id}`, 'PATCH', { response, status });
      changed();
    } catch (failure) {
      setError(message(failure));
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="ticket">
      <div className="item-header">
        <h3>{ticket.subject}</h3>
        <Badge tone={ticket.status === 'RESOLVED' ? 'green' : 'amber'}>
          {ticket.status.replaceAll('_', ' ').toLowerCase()}
        </Badge>
      </div>
      <p>{ticket.message}</p>
      <p className="field-hint">
        {date(ticket.createdAt, user?.locale, user?.timezone)}
        {t(' \u00B7 User ')}
        {ticket.userId}
        {ticket.activityId ? t(' \u00B7 Activity {value0}', { value0: ticket.activityId }) : ''}
      </p>
      <details className="support-response">
        <summary>{t('Respond & update status')}</summary>
        {error ? <Alert>{error}</Alert> : null}
        <FormAction onSubmit={save}>
          <Field id={`response-${ticket.id}`} label={t('Response visible to the learner')}>
            <textarea
              id={`response-${ticket.id}`}
              required
              minLength={3}
              maxLength={5000}
              rows={5}
              value={response}
              onChange={(event) => setResponse(event.target.value)}
            />
          </Field>
          <Field id={`status-${ticket.id}`} label={t('Request status')}>
            <select
              id={`status-${ticket.id}`}
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="OPEN">{t('Open')}</option>
              <option value="IN_PROGRESS">{t('In progress')}</option>
              <option value="RESOLVED">{t('Resolved')}</option>
            </select>
          </Field>
          <Button type="submit" busy={busy}>
            {t('Send response ')}
          </Button>
        </FormAction>
      </details>
    </article>
  );
}
function ServiceNotice() {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  async function send() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await api<{
        id: string;
      }>('/notifications/notices', 'POST', { title, body });
      setTitle('');
      setBody('');
      setNotice(
        t(
          'Notice queued for delivery. Job reference: {value0}. Check Background jobs for delivery status.',
          { value0: result.id },
        ),
      );
    } catch (failure) {
      setError(message(failure));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel reading-width">
      <h2>{t('Essential service notice')}</h2>
      <p>
        {t(
          'Send a notice to active members of this organization. Use this for information people need to use the service, such as planned maintenance. ',
        )}
      </p>
      {error ? <Alert>{error}</Alert> : null}
      {notice ? <Alert success>{notice}</Alert> : null}
      <FormAction onSubmit={send}>
        <Field id="notice-title" label={t('Notice title')}>
          <input
            id="notice-title"
            required
            minLength={2}
            maxLength={120}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </Field>
        <Field id="notice-body" label={t('Notice message')}>
          <textarea
            id="notice-body"
            required
            minLength={2}
            maxLength={3000}
            rows={7}
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
        </Field>
        <Button busy={busy} type="submit">
          {t('Send service notice ')}
        </Button>
      </FormAction>
    </section>
  );
}
function AuditLog() {
  const { user } = useApp();
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useData<Page<Audit>>(`/audit?page=${page}&limit=20`);
  return (
    <section>
      <div className="section-heading">
        <div>
          <h2>{t('Audit log')}</h2>
          <p>
            {t(
              'Publication, permission, support, and grade-changing actions in your organization.',
            )}
          </p>
        </div>
        <Button secondary onClick={reload}>
          <RefreshCw size={17} />
          {t(' Refresh ')}
        </Button>
      </div>
      {loading ? (
        <Loading />
      ) : error ? (
        <Alert>{error}</Alert>
      ) : data?.items.length ? (
        <>
          <div
            className="data-table-wrap"
            tabIndex={0}
            role="region"
            aria-label={t('Scrollable audit events')}
          >
            <table className="data-table">
              <caption className="sr-only">{t('Organization audit events, newest first')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('Action')}</th>
                  <th scope="col">{t('Actor')}</th>
                  <th scope="col">{t('Record')}</th>
                  <th scope="col">{t('Time')}</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.action}</td>
                    <td>
                      <code className="record-id">{item.actorId || t('System')}</code>
                    </td>
                    <td>
                      <code className="record-id">{item.objectId}</code>
                    </td>
                    <td>{date(item.createdAt, user?.locale, user?.timezone)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} total={data.total} change={setPage} />
        </>
      ) : (
        <Empty title={t('No recorded events yet.')} />
      )}
    </section>
  );
}
function Jobs() {
  const { user } = useApp();
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useData<Page<Job>>(`/jobs?page=${page}&limit=20`);
  const [busy, setBusy] = useState('');
  const [failure, setFailure] = useState('');
  const [notice, setNotice] = useState('');
  async function retry(id: string) {
    setBusy(id);
    setFailure('');
    setNotice('');
    try {
      await api(`/jobs/${id}/retry`, 'POST', {});
      setNotice(t('Failed job returned to the delivery queue.'));
      reload();
    } catch (error) {
      setFailure(message(error));
    } finally {
      setBusy('');
    }
  }
  return (
    <section>
      <div className="section-heading">
        <div>
          <h2>{t('Background jobs')}</h2>
          <p>
            {t(
              'Inspect delivery and scanning status. Failed jobs can be retried after the underlying issue is resolved. ',
            )}
          </p>
        </div>
        <Button secondary onClick={reload}>
          <RefreshCw size={17} />
          {t(' Refresh ')}
        </Button>
      </div>
      {failure || error ? <Alert>{failure || error}</Alert> : null}
      {notice ? <Alert success>{notice}</Alert> : null}
      {loading ? (
        <Loading />
      ) : data?.items.length ? (
        <>
          {data.items.map((job) => (
            <article className="ticket" key={job.id}>
              <div className="item-header">
                <h3>{job.type.replaceAll('_', ' ').toLowerCase()}</h3>
                <Badge tone={job.status === 'DONE' ? 'green' : 'amber'}>
                  {job.status.toLowerCase()}
                </Badge>
              </div>
              <p>
                {job.attempts}
                {t(' delivery attempts \u00B7')} {date(job.createdAt, user?.locale, user?.timezone)}
              </p>
              <p className="field-hint record-id">
                {t('Reference: ')}
                {job.id}
              </p>
              {job.lastError ? <p className="settings-note">{job.lastError}</p> : null}
              {job.status === 'FAILED' ? (
                <div className="actions">
                  <Button
                    secondary
                    busy={busy === job.id}
                    disabled={!!busy}
                    onClick={() => void retry(job.id)}
                  >
                    {t('Retry failed job ')}
                  </Button>
                </div>
              ) : null}
            </article>
          ))}
          <Pagination page={page} total={data.total} change={setPage} />
        </>
      ) : (
        <Empty title={t('There are no background jobs to show.')} />
      )}
    </section>
  );
}
function Settings() {
  const { data, loading, error } = useData<{
    id: string;
    name: string;
  }>('/organizations/current');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const [notice, setNotice] = useState('');
  async function save(event: React.FormEvent<HTMLFormElement>) {
    const name = String(new FormData(event.currentTarget).get('name'));
    setBusy(true);
    setFailure('');
    setNotice('');
    try {
      await api('/organizations/current', 'PATCH', { name });
      setNotice(t('Organization settings saved.'));
    } catch (error) {
      setFailure(message(error));
    } finally {
      setBusy(false);
    }
  }
  if (loading) return <Loading />;
  if (error) return <Alert>{error}</Alert>;
  return (
    <section className="panel reading-width">
      <span className="small-icon">
        <ShieldCheck size={23} />
      </span>
      <h2>{t('Organization settings')}</h2>
      {failure ? <Alert>{failure}</Alert> : null}
      {notice ? <Alert success>{notice}</Alert> : null}
      <FormAction onSubmit={save}>
        <Field id="organization-name" label={t('Organization name')}>
          <input
            id="organization-name"
            name="name"
            required
            minLength={2}
            maxLength={100}
            defaultValue={data?.name}
          />
        </Field>
        <Button type="submit" busy={busy}>
          {t('Save settings ')}
        </Button>
      </FormAction>
    </section>
  );
}
