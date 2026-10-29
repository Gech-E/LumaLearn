'use client';
import { t } from '@/lib/i18n';
import { Button } from './ui';

export function Pagination({
  page,
  total = 0,
  limit = 20,
  change,
  label,
}: {
  page: number;
  total?: number;
  limit?: number;
  change: (page: number) => void;
  label?: string;
}) {
  if (total <= limit && page === 1) return null;
  return (
    <nav className="pagination" aria-label={label || t('Results pages')}>
      <Button secondary disabled={page <= 1} onClick={() => change(page - 1)}>
        {t('Previous ')}
      </Button>
      <span aria-live="polite">
        {t('Page {page} of {pages} · {total} records', {
          page,
          pages: Math.max(1, Math.ceil(total / limit)),
          total,
        })}
      </span>
      <Button secondary disabled={page * limit >= total} onClick={() => change(page + 1)}>
        {t('Next ')}
      </Button>
    </nav>
  );
}
