'use client';
import { t, copy, date } from '@/lib/i18n';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Bell, CheckCircle2, Download, RefreshCw, Trash2 } from 'lucide-react';
import { api, message } from '@/lib/api';
import {
  downloads,
  pendingEvents,
  removeLesson,
  syncProgress,
  type Download as SavedLesson,
} from '@/lib/offline';
import type { Notification, Page, Ticket, User } from '@/lib/types';
import { useApp } from './application';
import { MfaSetup } from './account-security';
export { MfaSetup } from './account-security';
import { PrivacyControls } from './privacy-controls';
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
export function AccountPage({ section }: { section: string }) {
  return section === 'profile' ? (
    <Profile />
  ) : section === 'downloads' ? (
    <Downloads />
  ) : section === 'notifications' ? (
    <Notifications />
  ) : (
    <Help />
  );
}
function Profile() {
  const { refresh } = useApp();
  const { data, loading, error } = useData<User>('/users/me');
  const [name, setName] = useState('');
  const [timezone, setTimezone] = useState('Africa/Nairobi');
  const [locale, setLocale] = useState('en');
  const [reminders, setReminders] = useState(false);
  const [start, setStart] = useState('21:00');
  const [end, setEnd] = useState('08:00');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [failure, setFailure] = useState('');
  useEffect(() => {
    if (data) {
      setName(data.name);
      setTimezone(data.timezone || 'Africa/Nairobi');
      setLocale(data.locale || 'en');
      setReminders(data.reminders ?? false);
      setStart(data.quietStart || '21:00');
      setEnd(data.quietEnd || '08:00');
    }
  }, [data]);
  async function save() {
    setBusy(true);
    setFailure('');
    setNotice('');
    try {
      await api('/users/me', 'PATCH', {
        name,
        timezone,
        locale,
        reminders,
        quietStart: start,
        quietEnd: end,
      });
      await refresh();
      setNotice(copy('saved'));
      document.documentElement.lang = 'en';
    } catch (e) {
      setFailure(message(e));
    } finally {
      setBusy(false);
    }
  }
  if (loading) return <Loading />;
  if (error) return <Alert>{error}</Alert>;
  return (
    <>
      <PageHeading
        eyebrow={t('A SPACE THAT WORKS FOR YOU')}
        title={copy('profileTitle')}
        description={t('Your preferences support your learning. Change them whenever you need to.')}
      />
      <div className="account-grid">
        <section className="panel">
          <h2>{copy('preferences')}</h2>
          {failure ? <Alert>{failure}</Alert> : null}
          {notice ? <Alert success>{notice}</Alert> : null}
          <FormAction onSubmit={save}>
            <Field id="profile-name" label={copy('name')}>
              <input
                id="profile-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                minLength={2}
                maxLength={100}
                autoComplete="name"
              />
            </Field>
            <Field
              id="profile-email"
              label={copy('email')}
              hint={t('Your verified contact keeps account recovery secure.')}
            >
              <input id="profile-email" value={data?.email || ''} disabled />
            </Field>
            <div className="form-grid">
              <Field
                id="timezone"
                label={copy('timezone')}
                hint={t('Use an IANA timezone, such as Africa/Nairobi.')}
              >
                <input
                  id="timezone"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  required
                  list="timezones"
                />
                <datalist id="timezones">
                  <option value="Africa/Nairobi">{t('Africa/Nairobi')}</option>
                  <option value="Africa/Addis_Ababa">{t('Africa/Addis_Ababa')}</option>
                  <option value="Africa/Asmara">{t('Africa/Asmara')}</option>
                  <option value="Europe/London">{t('Europe/London')}</option>
                  <option value="America/New_York">{t('America/New_York')}</option>
                  <option value="UTC">UTC</option>
                </datalist>
              </Field>
              <Field id="interface-language" label={copy('interfaceLanguage')}>
                <select
                  id="interface-language"
                  value={locale}
                  onChange={(e) => setLocale(e.target.value)}
                >
                  <option value="en">{t('English')}</option>
                  <option value="ti">
                    {t('\u1275\u130D\u122D\u129B \u2014 English fallback')}
                  </option>
                </select>
              </Field>
            </div>
            {locale === 'ti' ? (
              <div className="settings-note">
                <p lang="ti">{t('\u1275\u130D\u122D\u129B')}</p>
                {copy('translationNotice')}
              </div>
            ) : null}
            <label className="check-label">
              <input
                type="checkbox"
                checked={reminders}
                onChange={(e) => setReminders(e.target.checked)}
              />
              <span>
                {copy('reminders')}
                <span className="field-hint" style={{ display: 'block' }}>
                  {t('Essential account and course notices are always delivered. ')}
                </span>
              </span>
            </label>
            <h3>{copy('quietHours')}</h3>
            <div className="form-grid">
              <Field id="quiet-start" label={copy('quietStart')}>
                <input
                  id="quiet-start"
                  type="time"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  required
                />
              </Field>
              <Field id="quiet-end" label={copy('quietEnd')}>
                <input
                  id="quiet-end"
                  type="time"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  required
                />
              </Field>
            </div>
            <Button busy={busy} type="submit">
              {copy('save')}
            </Button>
          </FormAction>
        </section>
        <aside>
          <MfaSetup />
          <PrivacyControls />
        </aside>
      </div>
    </>
  );
}
function Help() {
  const { user } = useApp();
  const { data, loading, error, reload } = useData<Page<Ticket>>(user ? '/support' : null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [kind, setKind] = useState('HELP');
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('kind');
    if (requested === 'EXPORT' || requested === 'DELETION') setKind(requested);
  }, []);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [failure, setFailure] = useState('');
  async function send() {
    setBusy(true);
    setFailure('');
    setNotice('');
    try {
      const activityId = new URLSearchParams(window.location.search).get('activityId');
      await api('/support', 'POST', {
        subject,
        kind,
        message: body,
        ...(activityId ? { activityId } : {}),
      });
      setSubject('');
      setBody('');
      setNotice(copy('supportSuccess'));
      reload();
    } catch (e) {
      setFailure(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow={t('YOU DON\u2019T HAVE TO FIGURE IT OUT ALONE')}
        title={copy('supportTitle')}
        description={copy('supportIntro')}
      />
      <div className="account-grid">
        <div>
          <section className="panel">
            <h2>{t('A question is a good place to start.')}</h2>
            {user ? (
              <>
                {failure ? <Alert>{failure}</Alert> : null}
                {notice ? <Alert success>{notice}</Alert> : null}
                <FormAction onSubmit={send}>
                  <Field id="help-kind" label={t('Request type')}>
                    <select
                      id="help-kind"
                      value={kind}
                      onChange={(event) => setKind(event.target.value)}
                    >
                      <option value="HELP">{t('General help')}</option>
                      <option value="EXPORT">{t('Account data export')}</option>
                      <option value="DELETION">{t('Account deletion request')}</option>
                    </select>
                  </Field>
                  <Field id="help-subject" label={copy('supportSubject')}>
                    <input
                      id="help-subject"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      required
                      minLength={3}
                      maxLength={150}
                      placeholder={t('For example: help with my assignment')}
                    />
                  </Field>
                  <Field
                    id="help-message"
                    label={copy('supportMessage')}
                    hint={t(
                      'Describe what happened and what you were trying to do. Do not include passwords.',
                    )}
                  >
                    <textarea
                      id="help-message"
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      required
                      minLength={5}
                      maxLength={5000}
                      rows={6}
                    />
                  </Field>
                  <Button busy={busy} type="submit">
                    {copy('supportSend')}
                  </Button>
                </FormAction>
              </>
            ) : (
              <>
                <p>
                  {t(
                    'Sign in to send a private request and follow its status. If you cannot sign in, start with account recovery. ',
                  )}
                </p>
                <div className="actions">
                  <LinkButton href="/login">{t('Sign in for support')}</LinkButton>
                  <Link href="/recover" className="text-link">
                    {t('Recover your account ')}
                  </Link>
                </div>
              </>
            )}
          </section>
          {user ? (
            <section>
              <div className="section-heading">
                <h2>{copy('supportHistory')}</h2>
                <button
                  className="text-button"
                  onClick={reload}
                  aria-label={t('Refresh help requests')}
                >
                  <RefreshCw size={18} />
                </button>
              </div>
              {loading ? (
                <Loading />
              ) : error ? (
                <Alert>{error}</Alert>
              ) : data?.items.length ? (
                data.items.map((ticket) => (
                  <article className="ticket" key={ticket.id}>
                    <div className="item-header">
                      <h3>{ticket.subject}</h3>
                      <Badge tone={ticket.status === 'RESOLVED' ? 'green' : 'amber'}>
                        {ticket.status.replaceAll('_', ' ').toLowerCase()}
                      </Badge>
                    </div>
                    <p>{ticket.message}</p>
                    {ticket.response ? (
                      <div className="ticket-response">
                        <strong>{t('Support response')}</strong>
                        <p>{ticket.response}</p>
                      </div>
                    ) : null}
                    <div className="item-footer">
                      <span>
                        {t('Request ')}
                        {ticket.id.slice(0, 8)}
                      </span>
                      <span>{date(ticket.createdAt, user.locale, user.timezone)}</span>
                    </div>
                  </article>
                ))
              ) : (
                <Empty title={copy('noRequests')} />
              )}
            </section>
          ) : null}
        </div>
        <aside className="panel faq">
          <h2>{t('A little guidance')}</h2>
          <details open>
            <summary>{t('How do I begin a course?')}</summary>
            <p>
              {t(
                'Explore the catalog, open a course, and choose \u201CJoin this course\u201D. Your enrolled courses appear in My learning. ',
              )}
            </p>
          </details>
          <details>
            <summary>{t('What can I do offline?')}</summary>
            <p>
              {t(
                'Save an available text lesson before disconnecting. Find it in Downloads. Lesson progress waits on your device and syncs after reconnection. Practice and assignment submission require a connection. ',
              )}
            </p>
          </details>
          <details>
            <summary>{t('Where is my feedback?')}</summary>
            <p>
              {t(
                'Once your instructor releases it, feedback appears on your Home page and in the assignment. Until then, your submitted receipt confirms that your work was received. ',
              )}
            </p>
          </details>
          <details>
            <summary>{t('I need more time or another attempt.')}</summary>
            <p>
              {t(
                'Send a help request from the activity and describe what you need. Your instructor can review extensions and attempt accommodations. ',
              )}
            </p>
          </details>
          <details>
            <summary>{t('I need an accessible alternative.')}</summary>
            <p>
              {t(
                'Use the reading and transcript where available. Send a request linked to the activity if a caption, document, or interaction prevents you from learning. ',
              )}
            </p>
          </details>
        </aside>
      </div>
    </>
  );
}
function Notifications() {
  const { user } = useApp();
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useData<Page<Notification>>(
    `/notifications?page=${page}&limit=20`,
  );
  const [failure, setFailure] = useState('');
  async function mark(id: string) {
    try {
      await api(`/notifications/${id}/read`, 'PATCH', {});
      reload();
    } catch (e) {
      setFailure(message(e));
    }
  }
  return (
    <>
      <PageHeading
        eyebrow={t('THE THINGS THAT MATTER')}
        title={copy('notificationsTitle')}
        description={t('Course notices, account updates, and released feedback, all in one place.')}
      />
      {failure || error ? <Alert>{failure || error}</Alert> : null}
      {loading ? (
        <Loading />
      ) : data?.items.length ? (
        <>
          {data.items.map((item) => (
            <article className="notification-item" key={item.id}>
              <div className="item-header">
                <h3>{item.title}</h3>
                {!item.readAt ? (
                  <Badge>{t('New')}</Badge>
                ) : (
                  <CheckCircle2 size={18} color="#12675b" />
                )}
              </div>
              <p>{item.body}</p>
              <div className="item-footer">
                <span>{date(item.createdAt, user?.locale, user?.timezone)}</span>
                {!item.readAt ? (
                  <button className="text-button" onClick={() => void mark(item.id)}>
                    {copy('markRead')}
                  </button>
                ) : (
                  <span>{t('Read')}</span>
                )}
              </div>
            </article>
          ))}
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
        <Empty title={copy('noNotifications')} description={copy('noNotificationsText')}>
          <Bell size={24} />
        </Empty>
      )}
    </>
  );
}
function Downloads() {
  const { user, online } = useApp();
  const [items, setItems] = useState<SavedLesson[]>([]);
  const [pending, setPending] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  async function load() {
    if (!user) return;
    try {
      const [lessons, events] = await Promise.all([downloads(user.id), pendingEvents(user.id)]);
      setItems(lessons);
      setPending(events.length);
    } catch (e) {
      setError(message(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, [user?.id]);
  async function remove(key: string) {
    try {
      await removeLesson(key);
      await load();
    } catch (e) {
      setError(message(e));
    }
  }
  async function sync() {
    if (!user) return;
    setBusy(true);
    setError('');
    try {
      const count = await syncProgress(user.id);
      setNotice(
        t('{value0} progress {value1} synced to your account.', {
          value0: count,
          value1: count === 1 ? 'update' : 'updates',
        }),
      );
      await load();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow={t('READY WHEN YOUR CONNECTION ISN\u2019T')}
        title={copy('downloadsTitle')}
        description={copy('downloadsIntro')}
      />
      <div className="download-status">
        <Download size={18} />
        <strong>
          {pending} {pending === 1 ? t('update') : t('updates')}
          {t(' waiting to sync ')}
        </strong>
        <Button
          secondary
          busy={busy}
          disabled={!online || pending === 0}
          onClick={() => void sync()}
        >
          {copy('syncNow')}
        </Button>
      </div>
      {error ? <Alert>{error}</Alert> : null}
      {notice ? <Alert success>{notice}</Alert> : null}
      {loading ? (
        <Loading />
      ) : items.length ? (
        items.map((item) => {
          const expired = new Date(item.expiresAt).getTime() < Date.now();
          return (
            <article className="download-item" key={item.key}>
              <div className="item-header">
                <div>
                  <p className="eyebrow">{item.activity.courseTitle}</p>
                  <h3 style={{ marginTop: 8 }}>{item.activity.title}</h3>
                </div>
                <Badge tone={expired ? 'amber' : 'green'}>
                  {expired ? t('Expired') : t('Available offline')}
                </Badge>
              </div>
              <p>
                {(item.bytes / 1024).toFixed(1)}
                {t(' KB \u00B7 Version ')}
                {item.version.slice(0, 12)}
                {t(' \u00B7 Expires')} {date(item.expiresAt, user?.locale, user?.timezone)}
              </p>
              <div className="actions">
                <LinkButton href={`/lesson/${item.activity.id}`}>
                  {expired ? t('Refresh lesson') : t('Open lesson')}
                </LinkButton>
                <button className="text-button" onClick={() => void remove(item.key)}>
                  <Trash2 size={16} />
                  {copy('remove')}
                </button>
              </div>
            </article>
          );
        })
      ) : (
        <Empty title={copy('noDownloads')} description={copy('noDownloadsText')}>
          <LinkButton href="/my-learning">{t('Choose a lesson')}</LinkButton>
        </Empty>
      )}
      <section className="panel soft" style={{ marginTop: 25 }}>
        <h2>{t('What stays on this device')}</h2>
        <p>
          {copy('offlineLimits')}
          {t(
            ' Downloaded text is private to your account. Signing out clears lessons, drafts, and pending progress. Reconnect and sync before signing out. Access changes cannot reach a disconnected device until it reconnects or the seven-day download expires. ',
          )}
        </p>
        <p style={{ marginTop: 12 }}>{copy('offlinePilotScope')}</p>
      </section>
    </>
  );
}
