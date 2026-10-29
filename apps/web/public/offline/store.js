/* global indexedDB, crypto */
import { copy } from './messages.js';

const request = (operation) =>
  new Promise((resolve, reject) => {
    operation.onsuccess = () => resolve(operation.result);
    operation.onerror = () => reject(operation.error);
  });
const committed = (transaction) =>
  new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onabort = () => reject(transaction.error || new Error(copy.storageError));
    transaction.onerror = () => reject(transaction.error || new Error(copy.storageError));
  });

let connection;
function database() {
  if (!connection)
    connection = new Promise((resolve, reject) => {
      const opening = indexedDB.open('pathway-offline-v1', 1);
      // Only the online app creates the private store after a sign-in.
      opening.onupgradeneeded = () => opening.transaction.abort();
      opening.onerror = () => reject(new Error(copy.unavailable));
      opening.onsuccess = () => {
        opening.result.onversionchange = () => opening.result.close();
        resolve(opening.result);
      };
    });
  return connection;
}

function identity(entry) {
  if (
    !entry ||
    typeof entry.user?.id !== 'string' ||
    !Number.isFinite(entry.expiresAt) ||
    entry.expiresAt <= Date.now()
  ) {
    throw new Error(copy.unavailable);
  }
  return entry;
}
function permitted(lesson, accountId) {
  return (
    lesson?.accountId === accountId &&
    lesson.activity?.kind === 'LESSON' &&
    lesson.activity.offlineAllowed !== false &&
    new Date(lesson.expiresAt).getTime() > Date.now()
  );
}

export async function snapshot() {
  const db = await database();
  const transaction = db.transaction(['identity', 'lessons', 'events'], 'readonly');
  const account = identity(await request(transaction.objectStore('identity').get('current')));
  // Check the account before reading any lesson or progress record.
  const [lessons, events] = await Promise.all([
    request(transaction.objectStore('lessons').getAll()),
    request(transaction.objectStore('events').getAll()),
  ]);
  return {
    expiresAt: account.expiresAt,
    lessons: lessons.filter((lesson) => permitted(lesson, account.user.id)),
    events: events.filter((event) => event.accountId === account.user.id),
  };
}

export async function completeLesson(activityId) {
  const db = await database();
  const transaction = db.transaction(['identity', 'lessons', 'events'], 'readwrite');
  const done = committed(transaction);
  void done.catch(() => {});
  const account = identity(await request(transaction.objectStore('identity').get('current')));
  const lesson = await request(
    transaction.objectStore('lessons').get(`${account.user.id}:${activityId}`),
  );
  if (!permitted(lesson, account.user.id)) throw new Error(copy.expired);
  const events = transaction.objectStore('events');
  const pending = await request(events.getAll());
  const alreadyQueued = pending.some(
    (event) =>
      event.accountId === account.user.id &&
      event.activityId === activityId &&
      event.state === 'COMPLETED',
  );
  if (!alreadyQueued && !['COMPLETED', 'PASSED'].includes(lesson.activity.completion)) {
    identity(account);
    await request(
      events.put({
        accountId: account.user.id,
        eventId: crypto.randomUUID(),
        activityId,
        state: 'COMPLETED',
        clientAt: new Date().toISOString(),
      }),
    );
  }
  await done;
}
