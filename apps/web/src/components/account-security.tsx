'use client';
import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { api, message } from '@/lib/api';
import { copy, t } from '@/lib/i18n';
import { useApp } from './application';
import { Alert, Button, Field, FormAction } from './ui';
import { RecoveryCodes } from './recovery-codes';
export function MfaSetup() {
  const { user, refresh } = useApp();
  const [setup, setSetup] = useState<{
    secret: string;
    uri: string;
  } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function begin() {
    setBusy(true);
    setError('');
    try {
      setSetup(await api('/auth/mfa/setup', 'POST', {}));
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function enable() {
    setBusy(true);
    setError('');
    try {
      await api('/auth/mfa/enable', 'POST', { code });
      setSetup(null);
      setCode('');
      await refresh();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <span className="small-icon">
        <ShieldCheck size={23} />
      </span>
      <h2 style={{ marginTop: 18 }}>{copy('security')}</h2>
      {error ? <Alert>{error}</Alert> : null}
      {user?.mfaEnabled ? (
        <>
          <Alert success>{copy('mfaEnabled')}</Alert>
          <RecoveryCodes />
        </>
      ) : (
        <>
          <p>{copy('mfaIntro')}</p>
          {setup ? (
            <FormAction onSubmit={enable}>
              <p style={{ marginTop: 18 }}>
                {t(
                  'In your authenticator, choose \u201CEnter a setup key\u201D. Use your Pathway email as the account name and choose a time-based code. ',
                )}
              </p>
              <div className="security-key" aria-label={t('Authenticator setup key')}>
                {setup.secret}
              </div>
              <Field id="mfa-code" label={copy('totp')}>
                <input
                  id="mfa-code"
                  value={code}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  minLength={6}
                  maxLength={6}
                  required
                  onChange={(e) => setCode(e.target.value)}
                />
              </Field>
              <Button busy={busy} type="submit">
                {copy('enableMfa')}
              </Button>
            </FormAction>
          ) : (
            <div className="actions">
              <Button busy={busy} onClick={() => void begin()}>
                {copy('setupMfa')}
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
