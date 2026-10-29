'use client';
import { t, copy } from '@/lib/i18n';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowRight, Leaf, ShieldCheck } from 'lucide-react';
import { api, message, setCsrf, signIn } from '@/lib/api';
import { useApp } from './application';
import { AuthDeliveryNotice } from './auth-delivery';
import { Alert, Button, Field, FormAction } from './ui';
function localDestination(value: string | null) {
  if (!value?.startsWith('/')) return '/home';
  try {
    const destination = new URL(value, window.location.origin);
    return destination.origin === window.location.origin
      ? `${destination.pathname}${destination.search}${destination.hash}`
      : '/home';
  } catch {
    return '/home';
  }
}
export function AuthPage({ mode }: { mode: string }) {
  const router = useRouter();
  const { refresh } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [totp, setTotp] = useState('');
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const register = mode === 'register';
  const recover = mode === 'recover';
  const reset = mode === 'reset' || mode === 'reset-password';
  const verify = mode === 'verify';
  const login = mode === 'login';
  async function submit() {
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      if (login) {
        const session = await signIn({
          email,
          password,
          ...(useRecoveryCode ? { recoveryCode } : totp ? { totp } : {}),
        });
        setCsrf(session.csrfToken);
        await refresh();
        const next = new URLSearchParams(window.location.search).get('next');
        router.push(localDestination(next));
      } else if (register) {
        await api<{
          message: string;
        }>('/auth/register', 'POST', {
          name,
          email,
          password,
        });
        setSuccess(t('Registration request received. Follow the verification instructions below.'));
        setPassword('');
      } else if (recover) {
        const result = await api<{
          message: string;
        }>('/auth/recover', 'POST', { email });
        setSuccess(
          result.message || t('If an account exists, recovery delivery has been requested.'),
        );
      } else {
        const token = new URLSearchParams(window.location.search).get('token');
        if (!token)
          throw new Error(t('This link is missing its verification token. Request a new link.'));
        const result = await api<{
          message: string;
        }>(verify ? '/auth/verify' : '/auth/reset', 'POST', {
          token,
          ...(reset ? { password } : {}),
        });
        setSuccess(result.message || t('All set. You can sign in now.'));
      }
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-layout">
      <section className="auth-story">
        <div className="auth-leaf">
          <Leaf size={66} strokeWidth={1.1} />
        </div>
        <p className="eyebrow">{t('YOUR NEXT CHAPTER')}</p>
        <h2>
          {t('A small step today. ')}
          <br />
          {t('A new possibility ')}
          <br />
          {t('tomorrow. ')}
        </h2>
        <p>
          {t('There\u2019s no perfect time to begin. ')}
          <br />
          {t('Just a little room to learn. ')}
        </p>
        <div className="auth-story-footer">
          <ShieldCheck size={18} />
          <span>{t('Your learning. Your pace. Your space.')}</span>
        </div>
      </section>
      <section className="auth-form">
        <span className="eyebrow">{t('WELCOME TO PATHWAY')}</span>
        <h1>
          {copy(
            register
              ? 'createTitle'
              : recover
                ? 'recoveryTitle'
                : reset
                  ? 'resetTitle'
                  : verify
                    ? 'verifyTitle'
                    : 'authTitle',
          )}
        </h1>
        <p>{copy(register ? 'createText' : recover ? 'recoveryText' : 'authText')}</p>
        {error ? <Alert>{error}</Alert> : null}
        {success ? <Alert success>{success}</Alert> : null}
        {register || recover || login ? <AuthDeliveryNotice requested={Boolean(success)} /> : null}
        <FormAction onSubmit={submit}>
          {register ? (
            <Field id="name" label={copy('name')}>
              <input
                id="name"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={100}
              />
            </Field>
          ) : null}
          {login || register || recover ? (
            <Field id="email" label={copy('email')}>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                maxLength={254}
              />
            </Field>
          ) : null}
          {login || register || reset ? (
            <Field
              id="password"
              label={copy('password')}
              hint={
                register || reset
                  ? t('Use at least 12 characters. A memorable passphrase works well.')
                  : undefined
              }
            >
              <input
                id="password"
                type="password"
                autoComplete={login ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={login ? 1 : 12}
                maxLength={128}
              />
            </Field>
          ) : null}
          {login ? (
            <>
              <details className="mfa-detail">
                <summary>{t('Two-step verification')}</summary>
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={useRecoveryCode}
                    onChange={(event) => {
                      setUseRecoveryCode(event.target.checked);
                      setTotp('');
                      setRecoveryCode('');
                    }}
                  />
                  {t('Use a recovery code')}
                </label>
                {useRecoveryCode ? (
                  <Field
                    id="recovery-code"
                    label={t('Recovery code')}
                    hint={t('Enter one unused recovery code. Your password is also required.')}
                  >
                    <input
                      id="recovery-code"
                      type="password"
                      autoComplete="one-time-code"
                      required
                      value={recoveryCode}
                      onChange={(event) => setRecoveryCode(event.target.value.trim())}
                      minLength={32}
                      maxLength={39}
                      pattern="[a-fA-F0-9-]{32,39}"
                    />
                  </Field>
                ) : (
                  <Field id="totp" label={copy('totp')}>
                    <input
                      id="totp"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9]{6}"
                      value={totp}
                      onChange={(e) => setTotp(e.target.value)}
                      maxLength={6}
                    />
                  </Field>
                )}
              </details>
              <Link className="auth-recover" href="/recover">
                {copy('recover')}
              </Link>
            </>
          ) : null}
          <Button type="submit" busy={busy}>
            {copy(
              register
                ? 'register'
                : recover
                  ? 'sendRecovery'
                  : reset
                    ? 'resetPassword'
                    : verify
                      ? 'verifyEmail'
                      : 'signIn',
            )}
            <ArrowRight size={18} />
          </Button>
        </FormAction>
        <p className="auth-switch">
          {login ? (
            <>
              {copy('noAccount')} <Link href="/register">{copy('register')}</Link>
            </>
          ) : (
            <>
              {copy('haveAccount')} <Link href="/login">{copy('signIn')}</Link>
            </>
          )}
        </p>
      </section>
    </div>
  );
}
export { JoinInvitation } from './join-invitation';
