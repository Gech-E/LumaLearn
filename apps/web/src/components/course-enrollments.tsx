'use client';
import { t } from '@/lib/i18n';
import { useState } from 'react';
import { api, message } from '@/lib/api';
import type { Page } from '@/lib/types';
import { useApp } from './application';
import { Invitations } from './invitations';
import { Pagination } from './pagination';
import { Alert, Badge, Button, Empty, Field, FormAction, Loading, useData } from './ui';
import { CourseLinks } from './course-navigation';
import { BulkEnrollment } from './bulk-enrollment';
export function EnrollmentManager({ id }: { id: string }) {
  const { user } = useApp();
  const academic = user?.roles.some((role) => ['INSTRUCTOR', 'ACADEMIC_ADMIN'].includes(role));
  const [invitationRevision, setInvitationRevision] = useState(0);
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useData<
    Page<{
      id: string;
      user: {
        id: string;
        name: string;
        email: string;
      };
      state: string;
      extraAttempts: number;
      extraTimeMinutes: number;
      deadlineExtension?: string;
    }>
  >(`/enrollments/course/${id}?page=${page}&limit=20`);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const [notice, setNotice] = useState('');
  async function add(event: React.FormEvent<HTMLFormElement>, kind: 'assign' | 'invite') {
    const form = event.currentTarget;
    const input = new FormData(form);
    setBusy(true);
    setFailure('');
    setNotice('');
    try {
      await api(
        `/enrollments/course/${id}/${kind}`,
        'POST',
        kind === 'assign'
          ? { userId: String(input.get('userId')) }
          : { email: String(input.get('email')) },
      );
      setNotice(
        kind === 'invite' ? t('Invitation queued for email delivery.') : t('Learner enrolled.'),
      );
      if (kind === 'invite') setInvitationRevision((value) => value + 1);
      form.reset();
      reload();
    } catch (e) {
      setFailure(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function accommodate(event: React.FormEvent<HTMLFormElement>, enrollmentId: string) {
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setFailure('');
    setNotice('');
    try {
      await api(`/enrollments/${enrollmentId}/accommodations`, 'PATCH', {
        extraAttempts: Number(form.get('extraAttempts')),
        extraTimeMinutes: Number(form.get('extraTimeMinutes')),
        ...(form.get('deadline')
          ? { deadlineExtension: `${form.get('deadline')}T23:59:59.000Z` }
          : {}),
      });
      setNotice(t('Learner accommodations saved.'));
      reload();
    } catch (e) {
      setFailure(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <CourseLinks id={id} current="enrollments" />
      <h2>{t('Enrollment & access')}</h2>
      {failure || error ? <Alert>{failure || error}</Alert> : null}
      {notice ? <Alert success>{notice}</Alert> : null}
      <div className="form-grid" style={{ marginTop: 24 }}>
        <section className="panel">
          <h3 style={{ marginTop: 0 }}>{t('Assign a learner')}</h3>
          <FormAction onSubmit={(e) => add(e, 'assign')}>
            <Field id="enroll-user" label={t('Organization user ID')}>
              <input id="enroll-user" name="userId" required maxLength={100} />
            </Field>
            <Button busy={busy} type="submit">
              {t('Assign enrollment ')}
            </Button>
          </FormAction>
        </section>
        <section className="panel">
          <h3 style={{ marginTop: 0 }}>{t('Invite by email')}</h3>
          <FormAction onSubmit={(e) => add(e, 'invite')}>
            <Field id="invite-email" label={t('Learner email')}>
              <input id="invite-email" name="email" type="email" required />
            </Field>
            <Button secondary busy={busy} type="submit">
              {t('Send course invitation ')}
            </Button>
          </FormAction>
        </section>
      </div>
      <BulkEnrollment courseId={id} onAssigned={reload} />
      <Invitations courseId={id} revision={invitationRevision} />
      {loading ? (
        <Loading />
      ) : data?.items.length ? (
        data.items.map((item) => (
          <details className="ticket" key={item.id}>
            <summary style={{ cursor: 'pointer' }}>
              <strong>{item.user.name}</strong> · {item.user.email}{' '}
              <Badge>{item.state.toLowerCase()}</Badge>
            </summary>
            {academic ? (
              <>
                <p style={{ margin: '17px 0' }}>
                  {t(
                    'Accommodation changes apply to this learner\u2019s future attempts. An already started attempt keeps its frozen expiry. ',
                  )}
                </p>
                <FormAction onSubmit={(e) => accommodate(e, item.id)}>
                  <div className="form-grid">
                    <Field id={`attempts-${item.id}`} label={t('Additional attempts')}>
                      <input
                        id={`attempts-${item.id}`}
                        name="extraAttempts"
                        type="number"
                        defaultValue={item.extraAttempts}
                        min={0}
                        max={50}
                      />
                    </Field>
                    <Field id={`time-${item.id}`} label={t('Additional minutes per timed attempt')}>
                      <input
                        id={`time-${item.id}`}
                        name="extraTimeMinutes"
                        type="number"
                        defaultValue={item.extraTimeMinutes}
                        min={0}
                        max={480}
                      />
                    </Field>
                    <Field
                      id={`deadline-${item.id}`}
                      label={t('Extended deadline (end of day, UTC)')}
                    >
                      <input
                        id={`deadline-${item.id}`}
                        name="deadline"
                        type="date"
                        defaultValue={item.deadlineExtension?.slice(0, 10) || ''}
                      />
                    </Field>
                  </div>
                  <Button secondary busy={busy} type="submit">
                    {t('Save accommodations ')}
                  </Button>
                </FormAction>
              </>
            ) : (
              <p className="settings-note">
                {t(
                  'This learner\u2019s academic accommodations are managed by an assigned instructor or administrator with academic record permission.',
                )}
              </p>
            )}
          </details>
        ))
      ) : (
        <Empty
          title={t('No enrollments yet.')}
          description={t('Publish this course, then invite or assign learners.')}
        />
      )}
      {!loading && data ? (
        <Pagination
          page={data.page ?? page}
          limit={data.limit}
          total={data.total}
          change={setPage}
          label={t('Enrollment pages')}
        />
      ) : null}
    </>
  );
}
