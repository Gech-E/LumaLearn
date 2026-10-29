/** Reviewed English fallback; keep offline interface copy separate from reader logic. */
export const copy = {
  unavailable:
    'Sign in to Pathway while connected to restore offline access. Your saved account has expired or is unavailable.',
  storageError:
    'Device storage could not be opened. Return to Pathway when connected to try again.',
  expired: 'This download has expired or is unavailable. Connect to refresh it in Pathway.',
  empty: 'No current downloads are available. Connect and save a text lesson in Pathway first.',
  ready: 'Offline reader ready. Your progress stays on this device until you reconnect and sync.',
  queued: 'Saved on this device. Waiting to sync.',
  completed: 'This lesson was already complete when downloaded.',
  complete: 'Mark lesson complete',
  completing: 'Saving…',
  back: 'Back to downloaded lessons',
  objective: 'Learning objective',
  reading: 'Lesson',
  example: 'Worked example',
  reflection: 'Reflection',
  transcript: 'Transcript',
  resources: 'Text resources',
  download: 'Download text',
  video:
    'Video and external files need a connection. Any saved transcript and permitted text resources are available below.',
  progress: (count) => `${count} progress ${count === 1 ? 'update' : 'updates'} waiting to sync.`,
  metadata: (size, expiry) => `${size} KB · Available until ${expiry}`,
};
