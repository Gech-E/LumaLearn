'use client';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { api, message, setCsrf } from '@/lib/api';
import { t } from '@/lib/i18n';
import { clearPrivateData } from '@/lib/offline';
import { useApp } from './application';
import { Alert, Button, Field, FormAction, LinkButton, Loading, PageHeading } from './ui';

const MfaSetup = dynamic(() => import('./account-security').then((module) => module.MfaSetup), {
  loading: Loading,
});

export function JoinInvitation() {
  const { user, mfaRequired, online, refresh } = useApp();
  const router = useRouter();
  const [courseId, setCourseId] = useState('');
  const [code, setCode] = useState('');
  const [next, setNext] = useState('/join');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    setCourseId(query.get('courseId') || '');
    setCode(query.get('invitationCode') || '');
    setNext(`/join${window.location.search}`);
  }, []);

  async function signInAgain() {
    setBusy(true);
    setError('');
    try {
      await api('/auth/logout', 'POST', {});
      await clearPrivateData();
      setCsrf('');
      await refresh();
      router.push(`/login?next=${encodeURIComponent(next)}`);
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy(false);
    }
  }
  async function join() {
    setBusy(true);
    setError('');
    try {
      const result = await api<{ courseId: string }>('/enrollments', 'POST', {
        courseId,
        invitationCode: code,
      });
      router.push(`/learn/${result.courseId}`);
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="reading-width">
      <PageHeading
        title={t('Your next chapter is ready.')}
        description={t('Accept a course invitation using the account that received it.')}
      />
      {error ? <Alert>{error}</Alert> : null}
      {!user ? (
        <section className="panel">
          <p>
            {t(
              'Sign in with the email address on your invitation. Your invitation details will be kept for the next step. ',
            )}
          </p>
          <div className="actions">
            <LinkButton href={`/login?next=${encodeURIComponent(next)}`}>
              {t('Sign in to accept ')}
            </LinkButton>
          </div>
        </section>
      ) : (
        <>
          <section className="panel">
            <p>
              {t('Signed in as ')}
              <strong>{user.email}</strong>
            </p>
            <p>
              {t(
                'Use the email address that received this invitation. You can change accounts without losing the invitation link.',
              )}
            </p>
            <div className="actions">
              <Button secondary busy={busy} disabled={!online} onClick={() => void signInAgain()}>
                {t('Use another account')}
              </Button>
            </div>
          </section>
          {mfaRequired ? (
            <>
              <Alert>
                {user.mfaEnabled
                  ? t('Verify two-step sign-in before accepting this invitation.')
                  : t(
                      'Your account requires two-step verification. Set it up here, then accept the invitation.',
                    )}
              </Alert>
              {user.mfaEnabled ? (
                <Button busy={busy} disabled={!online} onClick={() => void signInAgain()}>
                  {t('Sign in with your authenticator')}
                </Button>
              ) : (
                <MfaSetup />
              )}
            </>
          ) : (
            <section className="panel">
              <FormAction onSubmit={join}>
                <Field id="invitation-course" label={t('Course reference')}>
                  <input
                    id="invitation-course"
                    required
                    value={courseId}
                    onChange={(event) => setCourseId(event.target.value)}
                    maxLength={100}
                  />
                </Field>
                <Field id="invitation-code" label={t('Invitation code')}>
                  <input
                    id="invitation-code"
                    required
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    maxLength={100}
                    autoComplete="off"
                  />
                </Field>
                <p className="field-hint">{t('Invitations expire after seven days.')}</p>
                <div className="actions">
                  <Button type="submit" busy={busy} disabled={!online}>
                    {t('Accept invitation ')}
                    <ArrowRight size={18} />
                  </Button>
                </div>
              </FormAction>
            </section>
          )}
        </>
      )}
    </div>
  );
}
