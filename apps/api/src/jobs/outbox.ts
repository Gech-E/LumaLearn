import { Prisma, PrismaClient } from '@prisma/client';
import type { Queue } from 'bullmq';
import nodemailer from 'nodemailer';
import { readObject } from '../media/storage';
import { scanFile } from '../media/scanner';
import { tokenHash } from '../auth/auth.crypto';
import { MAX_JOB_ATTEMPTS } from './queue';

type Payload = Record<string, unknown>;
function payload(value: Prisma.JsonValue): Payload {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid job payload');
  return value as Payload;
}
function field(data: Payload, key: string): string {
  const value = data[key];
  if (typeof value !== 'string' || !value.length) throw new Error(`Missing job field ${key}`);
  return value;
}
export function smtpTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? '127.0.0.1',
    port: Number(process.env.SMTP_PORT ?? 1025),
    secure: process.env.SMTP_SECURE === 'true',
    requireTLS: process.env.NODE_ENV === 'production',
    ...(process.env.SMTP_USER
      ? { auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } }
      : {}),
    connectionTimeout: 3000,
    greetingTimeout: 3000,
    socketTimeout: 10000,
  });
}

/** PostgreSQL remains authoritative if Redis is lost after handoff. */
export async function dispatchOutbox(db: PrismaClient, queue: Queue) {
  const events = await db.outboxEvent.findMany({
    where: { status: { in: ['PENDING', 'QUEUED'] } },
    orderBy: { createdAt: 'asc' },
    take: 200,
  });
  for (const event of events) {
    const existing = await queue.getJob(event.id);
    if (existing && (await existing.getState()) === 'failed') {
      await db.outboxEvent.updateMany({
        where: { id: event.id, status: { in: ['PENDING', 'QUEUED'] } },
        data: {
          status: 'FAILED',
          lastError:
            'Background job stopped after failure or repeated worker stalls. Review and replay after repair.',
        },
      });
      continue;
    }
    if (event.attempts >= MAX_JOB_ATTEMPTS) {
      await db.outboxEvent.updateMany({
        where: { id: event.id, status: { in: ['PENDING', 'QUEUED'] } },
        data: {
          status: 'FAILED',
          lastError: 'Retry limit reached. Review dependency health before replay.',
        },
      });
      continue;
    }
    await queue.add(event.type, { eventId: event.id }, { jobId: event.id });
    await db.outboxEvent.updateMany({
      where: { id: event.id, status: 'PENDING' },
      data: { status: 'QUEUED' },
    });
  }
}

export async function deliverOutbox(db: PrismaClient, eventId: string) {
  // A row lock protects against concurrent workers and manual replay. Only ids are stored in Redis.
  await db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "OutboxEvent" WHERE id = ${eventId} FOR UPDATE`;
      const event = await tx.outboxEvent.findUnique({ where: { id: eventId } });
      if (!event || event.status === 'DONE' || event.status === 'FAILED') return;
      const data = payload(event.payload);
      if (event.type === 'EMAIL') {
        const mail = smtpTransport();
        try {
          await mail.sendMail({
            from: process.env.MAIL_FROM ?? 'Pathway <learning@pathway.local>',
            to: field(data, 'to'),
            subject: field(data, 'subject'),
            text: field(data, 'text'),
            messageId: `<pathway-${event.id}@notifications.pathway.local>`,
            disableFileAccess: true,
            disableUrlAccess: true,
          });
        } finally {
          mail.close();
        }
      } else if (event.type === 'SCAN_FILE') {
        const asset = await tx.asset.findFirst({
          where: { id: field(data, 'assetId'), organizationId: field(data, 'organizationId') },
        });
        if (!asset) throw new Error('Scan asset no longer exists');
        if (asset.status === 'QUARANTINED') {
          const bytes = await readObject(asset.key);
          if (bytes.length !== asset.size) throw new Error('Stored file size differs from upload');
          const status = await scanFile(bytes);
          await tx.asset.updateMany({
            where: { id: asset.id, status: 'QUARANTINED' },
            data: { status },
          });
        }
      } else if (event.type === 'SERVICE_NOTICE') {
        const organizationId = field(data, 'organizationId');
        let cursor: string | undefined;
        for (;;) {
          const members = await tx.membership.findMany({
            where: { organizationId, state: 'ACTIVE' },
            select: { id: true, userId: true },
            orderBy: { id: 'asc' },
            take: 250,
            ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          });
          if (!members.length) break;
          await tx.notification.createMany({
            data: members.map((member) => ({
              userId: member.userId,
              organizationId,
              eventId: `${event.id}-${member.userId}`,
              title: field(data, 'title'),
              body: field(data, 'body'),
            })),
            skipDuplicates: true,
          });
          cursor = members[members.length - 1].id;
        }
      } else if (event.type === 'REMINDER') {
        const userId = field(data, 'userId');
        const organizationId = field(data, 'organizationId');
        const user = await tx.user.findUnique({
          where: { id: userId },
          include: { memberships: { where: { organizationId, state: 'ACTIVE' } } },
        });
        if (user?.reminders && user.memberships.length && !quietNow(user, new Date())) {
          await tx.notification.createMany({
            data: [
              {
                userId,
                organizationId,
                eventId: event.id,
                title: 'Ready when you are',
                body: 'Your next learning activity is waiting. Continue at a pace that works for you.',
              },
            ],
            skipDuplicates: true,
          });
        }
      } else throw new Error('Unsupported background job type');
      // Erase account links/addresses after delivery; notification/file payloads contain no credentials.
      await tx.outboxEvent.update({
        where: { id: event.id },
        data: {
          status: 'DONE',
          lastError: null,
          ...(event.type === 'EMAIL'
            ? { payload: { organizationId: data.organizationId as string, delivered: true } }
            : {}),
        },
      });
    },
    { timeout: 60000, maxWait: 10000 },
  );
}

export async function recordJobFailure(db: PrismaClient, eventId: string, finalAttempt: boolean) {
  // Do not persist transport exceptions, which can contain recipients or credentials.
  await db.outboxEvent.updateMany({
    where: { id: eventId, status: { not: 'DONE' } },
    data: {
      attempts: { increment: 1 },
      status: finalAttempt ? 'FAILED' : 'QUEUED',
      lastError:
        'Dependency or delivery failure. Check worker, SMTP, storage, and scanner readiness.',
    },
  });
}

type QuietPreference = { timezone: string; quietStart: string; quietEnd: string };
export function localDay(now: Date, timezone: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}
export function quietNow(preference: QuietPreference, now: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: preference.timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const time = `${parts.find((p) => p.type === 'hour')!.value}:${parts.find((p) => p.type === 'minute')!.value}`;
  const { quietStart: start, quietEnd: end } = preference;
  if (start === end) return false;
  return start < end ? time >= start && time < end : time >= start || time < end;
}

export async function scheduleReminders(db: PrismaClient, now = new Date()) {
  let cursor: string | undefined;
  for (;;) {
    const users = await db.user.findMany({
      where: {
        reminders: true,
        verifiedAt: { not: null },
        enrollments: { some: { state: 'ACTIVE' } },
      },
      include: {
        memberships: { where: { state: 'ACTIVE' }, select: { organizationId: true } },
        enrollments: {
          where: { state: 'ACTIVE' },
          select: { course: { select: { organizationId: true } } },
        },
      },
      orderBy: { id: 'asc' },
      take: 250,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (!users.length) return;
    const events: Prisma.OutboxEventCreateManyInput[] = [];
    for (const user of users) {
      if (quietNow(user, now)) continue;
      for (const membership of user.memberships) {
        if (
          !user.enrollments.some(
            (enrollment) => enrollment.course.organizationId === membership.organizationId,
          )
        )
          continue;
        const id = `reminder-${tokenHash(`${user.id}/${membership.organizationId}/${localDay(now, user.timezone)}`)}`;
        events.push({
          id,
          type: 'REMINDER',
          payload: { userId: user.id, organizationId: membership.organizationId },
        });
      }
    }
    if (events.length) await db.outboxEvent.createMany({ data: events, skipDuplicates: true });
    cursor = users[users.length - 1].id;
  }
}
