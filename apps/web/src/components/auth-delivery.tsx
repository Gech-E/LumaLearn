'use client';
import { t } from '@/lib/i18n';
import { useData } from './ui';

type AuthDelivery = { mode: 'email' } | { mode: 'local-inbox'; inboxUrl: string };

export function AuthDeliveryNotice({ requested = false }: { requested?: boolean }) {
  const { data } = useData<AuthDelivery>('/auth/delivery');
  if (!data) return null;
  if (data.mode === 'email') {
    return requested ? (
      <p className="settings-note">
        {t(
          'Check your email for account instructions. If you already registered, sign in or request a password reset.',
        )}
      </p>
    ) : null;
  }
  return (
    <aside className="panel soft" aria-label={t('Local email delivery')}>
      <h3>
        {requested ? t('Next step: open the local inbox') : t('Email for this local preview')}
      </h3>
      <p>
        {t(
          'This local preview keeps verification and recovery messages in a local inbox. Messages are not delivered to your personal email account.',
        )}
      </p>
      <a
        className={requested ? 'button' : 'text-link'}
        href={data.inboxUrl}
        target="_blank"
        rel="noreferrer"
      >
        {t('Open local inbox')}
      </a>
    </aside>
  );
}
