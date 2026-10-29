/** Public delivery guidance never exposes production SMTP configuration. */
export function accountDelivery(environment: Record<string, string | undefined> = process.env) {
  const localInbox =
    environment.NODE_ENV === 'development' &&
    ['127.0.0.1', 'localhost', '::1'].includes(
      (environment.SMTP_HOST ?? '127.0.0.1').toLowerCase(),
    ) &&
    Number(environment.SMTP_PORT ?? 1025) === 1025;
  return localInbox
    ? { mode: 'local-inbox' as const, inboxUrl: 'http://127.0.0.1:8025' }
    : { mode: 'email' as const };
}
