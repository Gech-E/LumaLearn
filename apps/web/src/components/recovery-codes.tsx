'use client';
import { useState } from 'react';
import { api, message } from '@/lib/api';
import { t } from '@/lib/i18n';
import { downloadDocument } from '@/lib/download';
import { Alert, Button, Field, FormAction } from './ui';
import styles from './recovery-codes.module.css';

export function RecoveryCodes() {
  const [password, setPassword] = useState('');
  const [codes, setCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function generate() {
    setBusy(true);
    setError('');
    try {
      const result = await api<{ codes: string[]; generatedAt: string }>(
        '/auth/mfa/recovery-codes',
        'POST',
        { password },
      );
      setCodes(result.codes);
      setPassword('');
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label={t('Recovery codes')}>
      <h3>{t('Recovery codes')}</h3>
      <p>
        {t(
          'Use a recovery code with your password if you lose access to your authenticator. Each code works once. Generating a new set invalidates all previous codes.',
        )}
      </p>
      {error ? <Alert>{error}</Alert> : null}
      {codes.length ? (
        <>
          <Alert success>
            {t(
              'Save these codes now. They are shown only once. Store them somewhere private and separate from this device.',
            )}
          </Alert>
          <ol className={styles.codes}>
            {codes.map((code) => (
              <li key={code}>
                <code>{code}</code>
              </li>
            ))}
          </ol>
          <div className="actions">
            <Button
              secondary
              onClick={() =>
                downloadDocument(
                  'pathway-recovery-codes.txt',
                  `${t('Pathway recovery codes — keep private. Each code can be used once.')}\n\n${codes.join('\n')}`,
                )
              }
            >
              {t('Download recovery codes')}
            </Button>
            <Button onClick={() => setCodes([])}>{t('I saved my codes')}</Button>
          </div>
        </>
      ) : (
        <FormAction onSubmit={generate}>
          <Field id="recovery-password" label={t('Current password')}>
            <input
              id="recovery-password"
              type="password"
              autoComplete="current-password"
              required
              maxLength={128}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>
          <Button secondary type="submit" busy={busy}>
            {t('Generate recovery codes')}
          </Button>
        </FormAction>
      )}
    </section>
  );
}
