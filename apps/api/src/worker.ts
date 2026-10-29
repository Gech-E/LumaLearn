import 'reflect-metadata';
import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { Worker } from 'bullmq';
import { applyValidatedEnvironment } from './config/environment';
import {
  createOutboxQueue,
  MAX_JOB_ATTEMPTS,
  QUEUE_NAME,
  redisOptions,
  WORKER_HEARTBEAT,
} from './jobs/queue';
import { deliverOutbox, dispatchOutbox, recordJobFailure, scheduleReminders } from './jobs/outbox';

config();
async function main() {
  applyValidatedEnvironment();
  const db = new PrismaClient();
  await db.$connect();
  const queue = createOutboxQueue();
  const worker = new Worker<{ eventId: string }>(
    QUEUE_NAME,
    async (job) => {
      try {
        await deliverOutbox(db, job.data.eventId);
      } catch {
        await recordJobFailure(db, job.data.eventId, job.attemptsMade + 1 >= MAX_JOB_ATTEMPTS);
        throw new Error(
          'Background delivery failed; inspect dependency readiness and replay failed jobs after repair.',
        );
      }
    },
    {
      connection: { ...redisOptions(), maxRetriesPerRequest: null },
      concurrency: 4,
      lockDuration: 90000,
      maxStalledCount: 2,
    },
  );
  worker.on('error', () => console.error('Worker connection failure. Check Redis availability.'));
  worker.on('failed', (job) =>
    console.error(
      `Background job ${job?.id ?? 'unknown'} failed; attempt ${job?.attemptsMade ?? 0}.`,
    ),
  );
  let running = false;
  let stopping = false;
  let nextReminders = 0;
  async function tick() {
    if (running || stopping) return;
    running = true;
    try {
      await (await queue.client).set(WORKER_HEARTBEAT, new Date().toISOString(), { EX: 30 });
      await dispatchOutbox(db, queue);
      if (Date.now() >= nextReminders) {
        await scheduleReminders(db);
        nextReminders = Date.now() + 60000;
      }
    } catch {
      console.error('Outbox dispatch failed. Committed jobs remain durable in PostgreSQL.');
    } finally {
      running = false;
    }
  }
  const timer = setInterval(() => {
    void tick();
  }, 5000);
  await tick();
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    clearInterval(timer);
    await worker.close();
    while (running) await new Promise((resolve) => setTimeout(resolve, 50));
    await queue.close();
    await db.$disconnect();
  };
  process.once('SIGINT', () => {
    void stop();
  });
  process.once('SIGTERM', () => {
    void stop();
  });
  console.log(
    'Pathway worker running: outbox, email, quarantined file scanning, notices, and optional reminders.',
  );
}
main().catch(() => {
  console.error('Worker startup failed. Check validated environment and database availability.');
  process.exitCode = 1;
});
