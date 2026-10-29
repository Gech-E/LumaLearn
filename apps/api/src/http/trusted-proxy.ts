import type { Express } from 'express';

/** Enable only an operator-verified number of private ingress hops; default trusts none. */
export function configureProxyTrust(server: Express, hops: number) {
  if (!Number.isInteger(hops) || hops < 0 || hops > 3)
    throw new Error('TRUST_PROXY_HOPS must be an integer from 0 to 3');
  server.set('trust proxy', hops);
}
