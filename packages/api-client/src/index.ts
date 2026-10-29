import createClient, { type ClientOptions } from 'openapi-fetch';
import type { paths } from './schema';

// Regenerate schema.d.ts with `pnpm api:generate` after changing API DTOs.
export type { paths, components, operations } from './schema';
export function createApiClient(options: ClientOptions = {}) {
  return createClient<paths>(options);
}
export const API_PREFIX = '/api/v1';
