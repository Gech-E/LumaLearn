'use client';
import { copy } from '@/lib/i18n';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="error-screen">
      <h1>{copy('pageErrorTitle')}</h1>
      <p>{copy('pageErrorText')}</p>
      <button onClick={reset}>{copy('retry')}</button>
      <a href="/">{copy('returnHome')}</a>
    </main>
  );
}
