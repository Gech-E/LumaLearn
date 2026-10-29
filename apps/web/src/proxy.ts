import { randomBytes } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';

/** Per-document script nonces require dynamic rendering and uncached HTML. */
export function proxy(request: NextRequest) {
  const nonce = randomBytes(24).toString('base64');
  const development = process.env.NODE_ENV === 'development';
  const secure =
    request.nextUrl.protocol === 'https:' || request.headers.get('x-forwarded-proto') === 'https';
  const policy = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ''}`,
    // React style attributes remain permitted; authored content is rendered as text.
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: https:",
    `connect-src 'self' https:${development ? ' ws: wss:' : ''}`,
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(secure ? ['upgrade-insecure-requests'] : []),
  ].join('; ');
  const headers = new Headers(request.headers);
  headers.set('x-nonce', nonce);
  headers.set('Content-Security-Policy', policy);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set('Content-Security-Policy', policy);
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

export const config = {
  matcher: [
    {
      source: '/((?!api/|_next/|sw.js|offline.html|offline/|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
