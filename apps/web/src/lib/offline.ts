import { t } from '@/lib/i18n';
import { openDB } from 'idb';
import type { Activity, User } from './types';
import { ApiError } from './api';
import { learningApi } from './learning-api';
const database = () =>
  openDB('pathway-offline-v1', 1, {
    upgrade(db) {
      db.createObjectStore('lessons', { keyPath: 'key' });
      db.createObjectStore('events', { keyPath: 'eventId' });
      db.createObjectStore('identity');
      db.createObjectStore('drafts');
    },
  });
export interface Download {
  key: string;
  accountId: string;
  activity: Activity;
  bytes: number;
  savedAt: string;
  expiresAt: string;
  version: string;
}
export interface ProgressEvent {
  accountId: string;
  eventId: string;
  activityId: string;
  state: 'VIEWED' | 'COMPLETED';
  clientAt: string;
}
export async function rememberAccount(user: User) {
  const db = await database();
  const previous = (await db.get('identity', 'current')) as
    | {
        user: User;
      }
    | undefined;
  if (previous && previous.user.id !== user.id) await clearPrivateData();
  await db.put('identity', { user, expiresAt: Date.now() + 7 * 86400000 }, 'current');
}
export async function offlineAccount(): Promise<User | null> {
  const db = await database();
  const entry = (await db.get('identity', 'current')) as
    | {
        user: User;
        expiresAt: number;
      }
    | undefined;
  return entry && entry.expiresAt > Date.now() ? entry.user : null;
}
export async function downloadLesson(accountId: string, activity: Activity) {
  if (activity.kind !== 'LESSON') throw new Error(t('Only text lessons can be downloaded.'));
  if (!navigator.onLine) throw new Error(t('Connect to download or refresh a lesson.'));
  const authorized = await learningApi.download(activity.id);
  const db = await database();
  const record: Download = {
    key: `${accountId}:${activity.id}`,
    accountId,
    activity: authorized,
    bytes: authorized.sizeBytes,
    savedAt: authorized.downloadedAt,
    expiresAt: authorized.expiresAt,
    version: authorized.versionId || t('enrolled version'),
  };
  await db.put('lessons', record);
  return record;
}
export async function downloads(accountId: string): Promise<Download[]> {
  const db = await database();
  return ((await db.getAll('lessons')) as Download[]).filter((x) => x.accountId === accountId);
}
export async function readLesson(accountId: string, id: string): Promise<Activity | null> {
  const db = await database();
  const record = (await db.get('lessons', `${accountId}:${id}`)) as Download | undefined;
  return record && new Date(record.expiresAt).getTime() > Date.now() ? record.activity : null;
}
export async function removeLesson(key: string) {
  const db = await database();
  await db.delete('lessons', key);
}
export async function pendingEvents(accountId: string): Promise<ProgressEvent[]> {
  const db = await database();
  return ((await db.getAll('events')) as ProgressEvent[]).filter((e) => e.accountId === accountId);
}
export async function recordProgress(
  accountId: string,
  activityId: string,
  state: 'VIEWED' | 'COMPLETED',
) {
  const db = await database();
  const event: ProgressEvent = {
    accountId,
    eventId: crypto.randomUUID(),
    activityId,
    state,
    clientAt: new Date().toISOString(),
  };
  await db.put('events', event);
  if (!navigator.onLine) return false;
  const { accountId: _, ...payload } = event;
  void _;
  try {
    const result = await learningApi.progress(payload);
    if (result.acknowledged === event.eventId) {
      await db.delete('events', event.eventId);
      return true;
    }
    return false;
  } catch (error) {
    if (error instanceof ApiError && error.status >= 400 && error.status < 500) throw error;
    return false;
  }
}
export async function syncProgress(accountId: string) {
  const db = await database();
  const events = await pendingEvents(accountId);
  let count = 0;
  for (const event of events) {
    const { accountId: _, ...payload } = event;
    void _;
    const result = await learningApi.progress(payload);
    if (result.acknowledged === event.eventId) {
      await db.delete('events', event.eventId);
      count++;
    }
  }
  return count;
}
export async function saveLocalDraft(accountId: string, id: string, value: unknown) {
  const db = await database();
  await db.put('drafts', value, `${accountId}:${id}`);
}
export async function readLocalDraft<T>(accountId: string, id: string): Promise<T | undefined> {
  const db = await database();
  return db.get('drafts', `${accountId}:${id}`);
}
export async function clearPrivateData() {
  const db = await database();
  for (const name of ['lessons', 'events', 'identity', 'drafts']) await db.clear(name);
}
