import { Queue } from 'bullmq';

export const QUEUE_NAME = 'pathway-outbox';
export const WORKER_HEARTBEAT = 'pathway:worker:heartbeat';
export const MAX_JOB_ATTEMPTS = 5;

export function redisOptions() {
  const url = new URL(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379');
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: Number(url.pathname.slice(1) || 0),
    ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
  };
}

export function createOutboxQueue() {
  const queue = new Queue(QUEUE_NAME, {
    connection: { ...redisOptions(), maxRetriesPerRequest: 1, connectTimeout: 3000 },
    defaultJobOptions: {
      attempts: MAX_JOB_ATTEMPTS,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: { age: 7 * 86400, count: 10000 },
      removeOnFail: false,
    },
  });
  queue.on('error', () => {
    /* callers surface dependency failures without logging connection secrets */
  });
  return queue;
}
