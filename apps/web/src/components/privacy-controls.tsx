'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { t } from '@/lib/i18n';
import { message } from '@/lib/api';
import { accountExport } from '@/lib/privacy-export';
import { downloadDocument } from '@/lib/download';
import { Alert, Button } from './ui';

export function PrivacyControls() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  async function download() {
    const run = ++generation.current;
    const cancelled = () => generation.current !== run;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await accountExport(cancelled, (page, total) =>
        setNotice(t('Preparing export: page {page} of {total}.', { page, total })),
      );
      if (result && !cancelled()) {
        downloadDocument(
          'pathway-account-export.json',
          JSON.stringify(result, null, 2),
          'application/json',
        );
        setNotice(t('Your account export is ready. Keep the downloaded file private.'));
      }
    } catch (error) {
      if (!cancelled()) setError(message(error));
    } finally {
      if (!cancelled()) setBusy(false);
    }
  }
  function cancel() {
    generation.current++;
    setBusy(false);
    setNotice(t('Export cancelled.'));
  }
  return (
    <section className="panel soft">
      <h2>{t('Your account, your choices')}</h2>
      <p>
        {t(
          'Download your profile, enrollment and progress records, submission receipts, released grades, and help requests for this organization. Records may change while the export is prepared.',
        )}
      </p>
      {error ? <Alert>{error}</Alert> : null}
      {notice ? <Alert success>{notice}</Alert> : null}
      <div className="actions">
        <Button secondary busy={busy} onClick={() => void download()}>
          {t('Download my account data')}
        </Button>
        {busy ? (
          <Button secondary onClick={cancel}>
            {t('Cancel export')}
          </Button>
        ) : null}
      </div>
      <p>
        {t(
          'For additional records, corrections, or deletion, send a private request. Academic record retention depends on your provider’s policy.',
        )}
      </p>
      <div className="actions">
        <Link className="text-link" href="/help?kind=EXPORT">
          {t('Request a reviewed export')}
        </Link>
        <Link className="text-link" href="/help?kind=DELETION">
          {t('Request account deletion')}
        </Link>
      </div>
    </section>
  );
}
