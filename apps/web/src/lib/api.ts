import { createApiClient, type components } from '@pathway/api-client';
import { t } from './i18n';
let csrfToken = '';
export function setCsrf(value: string) {
  csrfToken = value;
}
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
    public requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
function serverError(data: unknown, status: number) {
  const err = (data || {}) as {
    message?: string | string[];
    code?: string;
    error?: string;
    requestId?: string;
  };
  return new ApiError(
    Array.isArray(err.message)
      ? err.message.join('. ')
      : err.message || t('Something went wrong. Please try again.'),
    status,
    err.code || err.error || 'REQUEST_FAILED',
    err.requestId,
  );
}
export function unwrap<T>(result: { data?: T; error?: unknown; response: Response }): T {
  if (!result.response.ok || result.data === undefined)
    throw serverError(result.error, result.response.status);
  return result.data;
}
export const client = createApiClient({ credentials: 'include', cache: 'no-store' });
client.use({
  onRequest({ request }) {
    if (request.method !== 'GET') request.headers.set('X-CSRF-Token', csrfToken);
    return request;
  },
});
export async function getSession() {
  const result = await client.GET('/api/v1/auth/session');
  if (!result.data) throw serverError(result.error, result.response.status);
  return result.data;
}
export async function signIn(body: components['schemas']['LoginDto']) {
  const result = await client.POST('/api/v1/auth/login', { body });
  if (!result.data) throw serverError(result.error, result.response.status);
  return result.data;
}
export async function uploadFile(file: File): Promise<components['schemas']['AssetDto']> {
  const body = new FormData();
  body.set('file', file);
  const response = await fetch('/api/v1/media/upload', {
    method: 'POST',
    credentials: 'include',
    headers: { 'X-CSRF-Token': csrfToken },
    body,
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) throw serverError(data, response.status);
  return data as components['schemas']['AssetDto'];
}
export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    method,
    credentials: 'include',
    cache: 'no-store',
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(method !== 'GET' ? { 'X-CSRF-Token': csrfToken } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (response.status === 204) return undefined as T;
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw serverError(data, response.status);
  }
  return data as T;
}
export function message(error: unknown) {
  return error instanceof Error ? error.message : t('Something went wrong. Please try again.');
}
