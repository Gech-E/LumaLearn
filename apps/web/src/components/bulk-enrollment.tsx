'use client';
import { useState } from 'react';
import { api, message } from '@/lib/api';
import { t } from '@/lib/i18n';
import { Alert, Badge, Button, Field, FormAction } from './ui';

interface Preview {
  total: number;
  eligible: number;
  alreadyEnrolled: number;
  unavailable: number;
  canAssign: boolean;
  items: {
    userId: string;
    name?: string;
    email?: string;
    status: 'ELIGIBLE' | 'ENROLLED' | 'UNAVAILABLE';
  }[];
}

export function BulkEnrollment({
  courseId,
  onAssigned,
}: {
  courseId: string;
  onAssigned: () => void;
}) {
  const [input, setInput] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [reviewedIds, setReviewedIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  async function review() {
    setError('');
    setNotice('');
    setPreview(null);
    const userIds = [
      ...new Set(
        input
          .split(/[\s,]+/)
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    ];
    if (!userIds.length || userIds.length > 100) {
      setError(t('Enter between 1 and 100 unique organization user IDs.'));
      return;
    }
    setBusy(true);
    try {
      const result = await api<Preview>(`/enrollments/course/${courseId}/bulk/preview`, 'POST', {
        userIds,
      });
      setReviewedIds(userIds);
      setPreview(result);
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy(false);
    }
  }
  async function assign() {
    if (!preview?.canAssign || !reviewedIds.length) return;
    setBusy(true);
    setError('');
    try {
      const result = await api<{ created: number; unchanged: number }>(
        `/enrollments/course/${courseId}/bulk/assign`,
        'POST',
        { userIds: reviewedIds },
      );
      setNotice(t('{created} learners enrolled. {unchanged} existing enrollments kept.', result));
      setInput('');
      setPreview(null);
      setReviewedIds([]);
      onAssigned();
    } catch (error) {
      setError(message(error));
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <h3>{t('Enroll a group')}</h3>
      <p>
        {t(
          'Review up to 100 organization user IDs before assigning this course. Existing enrollments are kept.',
        )}
      </p>
      {error ? <Alert>{error}</Alert> : null}
      {notice ? <Alert success>{notice}</Alert> : null}
      <FormAction onSubmit={review}>
        <Field
          id="bulk-users"
          label={t('Organization user IDs')}
          hint={t('Separate IDs with a new line or comma. Duplicate IDs are counted once.')}
        >
          <textarea
            id="bulk-users"
            rows={5}
            required
            maxLength={10100}
            value={input}
            disabled={busy}
            onChange={(event) => {
              setInput(event.target.value);
              setPreview(null);
              setNotice('');
            }}
          />
        </Field>
        <Button secondary type="submit" busy={busy}>
          {t('Preview enrollments')}
        </Button>
      </FormAction>
      {preview ? (
        <section aria-label={t('Enrollment preview')}>
          <p>
            {t('{eligible} ready · {enrolled} already enrolled · {unavailable} unavailable', {
              eligible: preview.eligible,
              enrolled: preview.alreadyEnrolled,
              unavailable: preview.unavailable,
            })}
          </p>
          {preview.unavailable ? (
            <Alert>
              {t('Remove unavailable IDs and preview again. No enrollment changes have been made.')}
            </Alert>
          ) : null}
          <ul className="list-clean">
            {preview.items.map((item) => (
              <li className="invitation-row" key={item.userId}>
                <span>
                  {item.name || item.userId}
                  {item.email ? ` · ${item.email}` : ''}
                </span>
                <Badge>
                  {item.status === 'ELIGIBLE'
                    ? t('Ready to enroll')
                    : item.status === 'ENROLLED'
                      ? t('Already enrolled')
                      : t('Unavailable')}
                </Badge>
              </li>
            ))}
          </ul>
          <Button
            busy={busy}
            disabled={!preview.canAssign || preview.eligible === 0}
            onClick={() => void assign()}
          >
            {t('Confirm group enrollment')}
          </Button>
        </section>
      ) : null}
    </section>
  );
}
