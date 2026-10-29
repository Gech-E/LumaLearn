'use client';
import { t, date } from '@/lib/i18n';
import { useState } from 'react';
import { api, message } from '@/lib/api';
import { useApp } from './application';
import type { Page } from '@/lib/types';
import { Pagination } from './pagination';
import { Alert, Badge, Button, Empty, Loading, useData } from './ui';
interface Invitation {
  id: string;
  email: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
}
export function Invitations({ courseId, revision }: { courseId: string; revision: number }) {
  const { user } = useApp();
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useData<Page<Invitation>>(
    `/enrollments/course/${courseId}/invitations?page=${page}&limit=20`,
    [revision],
  );
  const [busy, setBusy] = useState('');
  const [failure, setFailure] = useState('');
  const [notice, setNotice] = useState('');
  async function revoke(id: string) {
    setBusy(id);
    setFailure('');
    setNotice('');
    try {
      await api(`/enrollments/invitations/${id}`, 'DELETE');
      setNotice(t('Invitation revoked. Its link can no longer be used to join the course.'));
      reload();
    } catch (error) {
      setFailure(message(error));
    } finally {
      setBusy('');
    }
  }
  return (
    <section className="panel">
      <div className="section-heading">
        <h2>{t('Course invitations')}</h2>
        <Button secondary onClick={reload}>
          {t('Refresh invitations')}
        </Button>
      </div>
      {failure || error ? <Alert>{failure || error}</Alert> : null}
      {notice ? <Alert success>{notice}</Alert> : null}
      {loading ? (
        <Loading />
      ) : data?.items.length ? (
        data.items.map((invitation) => {
          const expired = new Date(invitation.expiresAt).getTime() <= Date.now();
          const state = invitation.acceptedAt
            ? t('Accepted')
            : invitation.revokedAt
              ? t('Revoked')
              : expired
                ? t('Expired')
                : t('Awaiting acceptance');
          return (
            <article className="invitation-row" key={invitation.id}>
              <div>
                <strong>{invitation.email}</strong>
                <p className="field-hint">
                  {t('Expires ')}
                  {date(invitation.expiresAt, user?.locale, user?.timezone)}
                </p>
              </div>
              <Badge tone={invitation.acceptedAt ? 'green' : 'neutral'}>{state}</Badge>
              {!invitation.acceptedAt && !invitation.revokedAt && !expired ? (
                <Button
                  secondary
                  busy={busy === invitation.id}
                  disabled={!!busy}
                  onClick={() => void revoke(invitation.id)}
                >
                  {t('Revoke invitation')}
                </Button>
              ) : null}
            </article>
          );
        })
      ) : (
        <Empty
          title={t('No invitations sent yet.')}
          description={t('Invite a learner by email using the form above.')}
        />
      )}
      {!loading && data ? (
        <Pagination
          page={data.page ?? page}
          limit={data.limit}
          total={data.total}
          change={setPage}
          label={t('Invitation pages')}
        />
      ) : null}
    </section>
  );
}
