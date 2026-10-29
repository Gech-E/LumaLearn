import { api } from './api';
import { t } from './i18n';

const collections = ['enrollments', 'progress', 'receipts', 'grades', 'support'] as const;
type Collection = (typeof collections)[number];
type ExportPage = {
  schemaVersion: number;
  generatedAt: string;
  scope: string;
  profile: unknown;
  membership: unknown;
} & Record<Collection, { items: unknown[]; total: number; page: number; limit: number }>;

/** Bounded self-service export; large exports use the existing reviewed support path. */
export async function accountExport(
  cancelled: () => boolean,
  progress: (page: number, total: number) => void,
) {
  const first = await api<ExportPage>('/users/me/export?page=1&limit=100');
  if (cancelled()) return null;
  const pages = Math.max(
    1,
    ...collections.map((key) => Math.ceil(first[key].total / first[key].limit)),
  );
  if (pages > 100)
    throw new Error(
      t('This export is too large for a browser download. Request an export through support.'),
    );
  const gathered = Object.fromEntries(
    collections.map((key) => [key, { items: [...first[key].items], total: first[key].total }]),
  ) as Record<Collection, { items: unknown[]; total: number }>;
  const result = {
    schemaVersion: first.schemaVersion,
    generatedAt: first.generatedAt,
    scope: first.scope,
    profile: first.profile,
    membership: first.membership,
    ...gathered,
    pagesDownloaded: pages,
  };
  let bytes = JSON.stringify(first).length;
  if (bytes > 25_000_000)
    throw new Error(
      t('This export is too large for a browser download. Request an export through support.'),
    );
  progress(1, pages);
  for (let page = 2; page <= pages; page++) {
    if (cancelled()) return null;
    const next = await api<ExportPage>(`/users/me/export?page=${page}&limit=100`);
    if (cancelled()) return null;
    bytes += JSON.stringify(next).length;
    if (bytes > 25_000_000)
      throw new Error(
        t('This export is too large for a browser download. Request an export through support.'),
      );
    for (const key of collections) result[key].items.push(...next[key].items);
    progress(page, pages);
  }
  return result;
}
