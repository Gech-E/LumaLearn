import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { APP_GUARD } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { DatabaseModule } from '../src/database/database.module';
import { PrismaService } from '../src/database/prisma.service';
import { AuthGuard } from '../src/auth/auth.guard';
import { tokenHash } from '../src/auth/auth.crypto';
import { configureApp } from '../src/bootstrap';
import { learningModules } from '../src/learning-modules';

type Identity = { id: string; membershipId: string; cookie: string; csrf: string };
type Fixture = {
  id: string;
  versionId: string;
  lesson: string;
  practice: string;
  assignment: string;
  outline: ReturnType<typeof outline>;
};
const tomorrow = () => new Date(Date.now() + 86400000).toISOString();
function outline(
  deadline?: string,
  feedbackRelease = 'AFTER_SUBMIT',
  maxAttempts = 2,
  timeLimitMinutes?: number,
) {
  const base = {
    objective: 'Demonstrate a useful skill.',
    body: 'Read the example and practice the skill.',
    example: 'Use a descriptive filename.',
    reflection: 'What would you do next?',
    estimatedMinutes: 5,
    resources: [] as {
      title: string;
      url?: string;
      text?: string;
      accessible: boolean;
      offlineAllowed: boolean;
    }[],
    accessibility: { imagesHaveAlt: true, resourcesReviewed: true, headingsReviewed: true },
    rights: 'Original test content',
    offlineAllowed: true,
    prerequisiteIds: [] as string[],
  };
  return {
    title: 'Test digital skills',
    description: 'Meaningful skills for a fictional test course.',
    outcomes: ['Organize a file'],
    prerequisites: [],
    completionRule: 'Complete the lesson and pass the practice and assignment.',
    modules: [
      {
        title: 'Test module',
        activities: [
          { ...base, id: 'lesson', title: 'Read a worked example', kind: 'LESSON' },
          {
            ...base,
            id: 'practice',
            title: 'Practice safely',
            kind: 'PRACTICE',
            offlineAllowed: false,
            assessment: {
              maxAttempts,
              passPercent: 70,
              feedbackRelease,
              ...(deadline ? { deadline } : {}),
              ...(timeLimitMinutes ? { timeLimitMinutes } : {}),
              questions: [
                {
                  kind: 'SINGLE',
                  prompt: 'Choose the descriptive name.',
                  options: ['receipt.pdf', 'file.pdf'],
                  answer: ['receipt.pdf'],
                  explanation: 'A descriptive topic is easier to find.',
                  points: 1,
                },
                {
                  kind: 'MULTIPLE',
                  prompt: 'Choose both safe actions.',
                  options: ['Verify recipient', 'Check attachment', 'Share password'],
                  answer: ['Verify recipient', 'Check attachment'],
                  explanation: 'Check where the file goes and what it contains.',
                  points: 1,
                },
                {
                  kind: 'SHORT_TEXT',
                  prompt: 'What groups related files?',
                  options: [],
                  answer: ['folder', 'a folder'],
                  explanation: 'A folder groups related files.',
                  points: 1,
                },
              ],
            },
          },
          {
            ...base,
            id: 'assignment',
            title: 'Submit a practical example',
            kind: 'ASSIGNMENT',
            offlineAllowed: false,
            rubric: {
              passPercent: 70,
              ...(deadline ? { deadline } : {}),
              criteria: [
                {
                  id: 'clear',
                  title: 'Clear organization',
                  description: 'Uses clear folder and file names.',
                  maxPoints: 10,
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

describe('Learning API with real PostgreSQL and the production authorization guard', () => {
  let app: INestApplication;
  let db: PrismaService;
  let org: string;
  let learner: Identity;
  let learner2: Identity;
  let instructor: Identity;
  let unassigned: Identity;
  let admin: Identity;
  let support: Identity;
  let outsider: Identity;
  let suspended: Identity;
  let course: Fixture;
  const sessions: string[] = [];

  function api(person?: Identity) {
    const server = app.getHttpServer();
    const build = (method: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string) => {
      const operation = request(server)[method](`/api/v1${path}`);
      return person
        ? operation
            .set('Cookie', person.cookie)
            .set('X-CSRF-Token', person.csrf)
            .set('Origin', 'http://localhost:3000')
        : operation;
    };
    return {
      get: (path: string) => build('get', path),
      post: (path: string) => build('post', path),
      put: (path: string) => build('put', path),
      patch: (path: string) => build('patch', path),
      delete: (path: string) => build('delete', path),
    };
  }
  async function person(roles: Role[], organizationId = org, inactive = false): Promise<Identity> {
    const id = randomUUID();
    const user = await db.user.create({
      data: {
        id,
        email: `${id}@integration.invalid`,
        name: 'Fictional integration account',
        passwordHash: 'unused-session-fixture',
        verifiedAt: new Date(),
        mfaSecret: roles.some((r) => r !== 'LEARNER') ? 'enabled-test-fixture' : null,
      },
    });
    const membership = await db.membership.create({
      data: {
        userId: user.id,
        organizationId,
        state: inactive ? 'SUSPENDED' : 'ACTIVE',
        roles: { create: roles.map((role) => ({ role })) },
      },
    });
    const raw = randomUUID();
    const csrf = randomUUID();
    const session = await db.session.create({
      data: {
        userId: user.id,
        membershipId: membership.id,
        tokenHash: tokenHash(raw),
        csrfToken: csrf,
        mfaVerified: true,
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    sessions.push(session.id);
    return { id: user.id, membershipId: membership.id, cookie: `pathway_session=${raw}`, csrf };
  }
  async function saveOutline(courseId: string, draft: object, status = 200) {
    const editor = await api(instructor).get(`/courses/${courseId}/editor`).expect(200);
    return api(instructor)
      .put(`/courses/${courseId}/outline`)
      .send({
        ...draft,
        expectedVersionId: editor.body.version?.id ?? null,
        expectedRevision: editor.body.version?.revision ?? 0,
      })
      .expect(status);
  }
  async function makeCourse(draft = outline(), isPublic = true): Promise<Fixture> {
    const created = await api(instructor)
      .post('/courses')
      .send({
        title: draft.title,
        summary: draft.description,
        subject: 'Digital skills',
        level: 'Beginner',
        language: 'en',
        isPublic,
      })
      .expect(201);
    const saved = await saveOutline(created.body.id, draft);
    const activities = saved.body.version.modules[0].activities;
    await api(instructor).post(`/courses/${created.body.id}/publish`).expect(201);
    return {
      id: created.body.id,
      versionId: saved.body.version.id,
      lesson: activities[0].id,
      practice: activities[1].id,
      assignment: activities[2].id,
      outline: draft,
    };
  }
  async function enroll(person: Identity, fixture = course) {
    return (await api(person).post('/enrollments').send({ courseId: fixture.id }).expect(201)).body;
  }
  const correct = (attempt: any) => ({
    responses: attempt.questions.map((q: any) => ({
      questionId: q.id,
      answer:
        q.kind === 'SINGLE'
          ? 'receipt.pdf'
          : q.kind === 'MULTIPLE'
            ? ['Check attachment', 'Verify recipient']
            : ' FOLDER ',
    })),
  });

  beforeAll(async () => {
    const url = process.env.TEST_DATABASE_URL;
    if (!url || !new URL(url).pathname.endsWith('_test'))
      throw new Error(
        'Set TEST_DATABASE_URL to a dedicated PostgreSQL database whose name ends in _test; migrate it first.',
      );
    process.env.DATABASE_URL = url;
    process.env.NODE_ENV = 'test';
    process.env.WEB_ORIGIN = 'http://localhost:3000';
    const module = await Test.createTestingModule({
      imports: [DatabaseModule, ...learningModules],
      providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
    }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    db = app.get(PrismaService);
    org = (
      await db.organization.create({ data: { name: 'Isolated learning integration fixture' } })
    ).id;
    const otherOrg = (
      await db.organization.create({ data: { name: 'Other integration organization' } })
    ).id;
    [learner, learner2, instructor, unassigned, admin, support, outsider, suspended] =
      await Promise.all([
        person(['LEARNER']),
        person(['LEARNER']),
        person(['INSTRUCTOR']),
        person(['INSTRUCTOR']),
        person(['ADMIN']),
        person(['SUPPORT']),
        person(['LEARNER'], otherOrg),
        person(['LEARNER'], org, true),
      ]);
    course = await makeCourse();
  });
  afterAll(async () => {
    if (db)
      await db.session.updateMany({
        where: { id: { in: sessions } },
        data: { revokedAt: new Date() },
      });
    if (app) await app.close();
  });

  it('requires authentication, active membership, CSRF and trusted origins', async () => {
    await api().get('/learning/home').expect(401);
    await api(suspended).get('/learning/home').expect(403);
    await request(app.getHttpServer())
      .post('/api/v1/enrollments')
      .set('Cookie', learner.cookie)
      .send({ courseId: course.id })
      .expect(403);
    await api(learner)
      .post('/enrollments')
      .set('Origin', 'https://attacker.invalid')
      .send({ courseId: course.id })
      .expect(403);
  });

  it('creates one enrollment, one notification and one audit action for concurrent retries', async () => {
    const responses = await Promise.all(
      Array.from({ length: 4 }, () =>
        api(learner).post('/enrollments').send({ courseId: course.id }),
      ),
    );
    expect(responses.map((r) => r.status)).toEqual([201, 201, 201, 201]);
    expect(new Set(responses.map((r) => r.body.id)).size).toBe(1);
    expect(await db.enrollment.count({ where: { userId: learner.id, courseId: course.id } })).toBe(
      1,
    );
    expect(
      await db.notification.count({ where: { eventId: `enrollment:${responses[0].body.id}` } }),
    ).toBe(1);
    expect(
      await db.auditEvent.count({
        where: { objectId: responses[0].body.id, action: 'enrollment.created' },
      }),
    ).toBe(1);
    await enroll(learner2);
  });

  it('denies cross-organization access and unassigned instructor access', async () => {
    await api(outsider).post('/enrollments').send({ courseId: course.id }).expect(404);
    await api(outsider).get(`/learning/activities/${course.lesson}`).expect(404);
    await api(unassigned).get(`/courses/${course.id}/editor`).expect(403);
    await api(unassigned).get(`/reporting/courses/${course.id}`).expect(403);
    await api(admin).get(`/reporting/courses/${course.id}`).expect(403);
    await api(support).get(`/reporting/courses/${course.id}`).expect(403);
  });

  it('hides private courses from public details and enrollment', async () => {
    const privateCourse = await makeCourse(outline(), false);
    await api().get(`/courses/${privateCourse.id}`).expect(404);
    await api(learner).post('/enrollments').send({ courseId: privateCourse.id }).expect(404);
    const catalog = await api().get('/courses?limit=50').expect(200);
    expect(catalog.body.items.some((c: any) => c.id === privateCourse.id)).toBe(false);
    await api(instructor)
      .post(`/enrollments/course/${privateCourse.id}/assign`)
      .send({ userId: learner.id })
      .expect(201);
    await api(learner).get(`/learning/activities/${privateCourse.lesson}`).expect(200);
  });

  it('previews scoped bulk assignments and commits concurrent retries once without partial enrollment', async () => {
    const fixture = await makeCourse(outline(), false);
    const path = `/enrollments/course/${fixture.id}/bulk`;
    const mixed = { userIds: [learner.id, outsider.id, suspended.id] };
    const preview = await api(instructor).post(`${path}/preview`).send(mixed).expect(201);
    expect(preview.body).toMatchObject({
      total: 3,
      eligible: 1,
      unavailable: 2,
      alreadyEnrolled: 0,
      canAssign: false,
    });
    expect(
      preview.body.items.find((item: { userId: string }) => item.userId === outsider.id),
    ).toEqual({ userId: outsider.id, status: 'UNAVAILABLE' });
    await api(instructor).post(`${path}/assign`).send(mixed).expect(409);
    expect(await db.enrollment.count({ where: { courseId: fixture.id } })).toBe(0);
    await api(unassigned)
      .post(`${path}/preview`)
      .send({ userIds: [learner.id] })
      .expect(403);
    await api(outsider)
      .post(`${path}/assign`)
      .send({ userIds: [learner.id] })
      .expect(404);
    await api(instructor)
      .post(`${path}/assign`)
      .send({ userIds: [learner.id, learner.id] })
      .expect(400);
    await api(instructor).post(`${path}/preview`).send({ userIds: [] }).expect(400);
    await api(instructor)
      .post(`${path}/preview`)
      .send({ userIds: Array.from({ length: 101 }, () => randomUUID()) })
      .expect(400);
    const selected = { userIds: [learner.id, learner2.id] };
    const outcomes = await Promise.all([
      api(instructor).post(`${path}/assign`).send(selected),
      api(instructor).post(`${path}/assign`).send(selected),
    ]);
    expect(outcomes.map((result) => result.status)).toEqual([201, 201]);
    expect(outcomes.map((result) => result.body.created).sort()).toEqual([0, 2]);
    expect(await db.enrollment.count({ where: { courseId: fixture.id } })).toBe(2);
    for (const enrollment of outcomes[0].body.items) {
      expect(
        await db.notification.count({ where: { eventId: `enrollment:${enrollment.id}` } }),
      ).toBe(1);
      expect(
        await db.auditEvent.count({
          where: { action: 'enrollment.created', objectId: enrollment.id },
        }),
      ).toBe(1);
    }
    const repeated = await api(instructor).post(`${path}/preview`).send(selected).expect(201);
    expect(repeated.body).toMatchObject({
      eligible: 0,
      alreadyEnrolled: 2,
      unavailable: 0,
      canAssign: true,
    });
    const withdrawn = outcomes[0].body.items[0];
    await db.enrollment.update({ where: { id: withdrawn.id }, data: { state: 'WITHDRAWN' } });
    await api(instructor).post(`${path}/assign`).send(selected).expect(409);
    expect((await db.enrollment.findUniqueOrThrow({ where: { id: withdrawn.id } })).state).toBe(
      'WITHDRAWN',
    );
  });

  it('rejects a second editor save without replacing the winning draft', async () => {
    const created = await api(instructor)
      .post('/courses')
      .send({
        title: 'Concurrent editing fixture',
        summary: 'Review two editor saves.',
        subject: 'Digital skills',
        level: 'Beginner',
        language: 'en',
      })
      .expect(201);
    const snapshot = (await api(instructor).get(`/courses/${created.body.id}/editor`).expect(200))
      .body.version;
    expect(snapshot.revision).toBe(1);
    const expected = { expectedVersionId: snapshot.id, expectedRevision: snapshot.revision };
    const first = { ...outline(), title: 'Editor one title', ...expected };
    const second = { ...outline(), title: 'Editor two title', ...expected };
    const responses = await Promise.all([
      api(instructor).put(`/courses/${created.body.id}/outline`).send(first),
      api(instructor).put(`/courses/${created.body.id}/outline`).send(second),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    const winner = responses.find((response) => response.status === 200)!.body.version;
    const conflict = responses.find((response) => response.status === 409)!;
    expect(conflict.body.code).toBe('OUTLINE_CONFLICT');
    const saved = (await api(instructor).get(`/courses/${created.body.id}/editor`).expect(200)).body
      .version;
    expect(saved).toEqual(winner);
    expect(saved.revision).toBe(2);
    expect(saved.modules[0].activities).toHaveLength(3);
    await api(instructor).put(`/courses/${created.body.id}/outline`).send(first).expect(409);
    await api(instructor).put(`/courses/${created.body.id}/outline`).send(outline()).expect(400);
  });

  it('rejects stale published-version editor tokens after another editor creates a new draft', async () => {
    const fixture = await makeCourse();
    const published = (await api(instructor).get(`/courses/${fixture.id}/editor`).expect(200)).body
      .version;
    const expected = { expectedVersionId: published.id, expectedRevision: published.revision };
    const newDraft = await api(instructor)
      .put(`/courses/${fixture.id}/outline`)
      .send({ ...outline(), title: 'New revision under review', ...expected })
      .expect(200);
    expect(newDraft.body.version.id).not.toBe(published.id);
    expect(newDraft.body.version.revision).toBe(1);
    const stale = await api(instructor)
      .put(`/courses/${fixture.id}/outline`)
      .send({ ...outline(), title: 'Stale editor content', ...expected })
      .expect(409);
    expect(stale.body.code).toBe('OUTLINE_CONFLICT');
    expect((await db.courseVersion.findUniqueOrThrow({ where: { id: published.id } })).title).toBe(
      published.title,
    );
    expect(
      (await api(instructor).get(`/courses/${fixture.id}/editor`).expect(200)).body.version.title,
    ).toBe('New revision under review');
  });

  it('deduplicates offline events and never downgrades confirmed progress', async () => {
    const eventId = randomUUID();
    const payload = {
      eventId,
      activityId: course.lesson,
      state: 'COMPLETED',
      clientAt: '2026-01-01T00:00:00.000Z',
    };
    const results = await Promise.all([
      api(learner).post('/learning/progress').send(payload),
      api(learner).post('/learning/progress').send(payload),
    ]);
    expect(results.every((r) => r.status === 201 && r.body.acknowledged === eventId)).toBe(true);
    expect(await db.progressEvent.count({ where: { id: eventId } })).toBe(1);
    const viewed = await api(learner)
      .post('/learning/progress')
      .send({ eventId: randomUUID(), activityId: course.lesson, state: 'VIEWED' })
      .expect(201);
    expect(viewed.body.state).toBe('COMPLETED');
    await api(learner2).post('/learning/progress').send(payload).expect(409);
    await api(learner)
      .post('/learning/progress')
      .send({ eventId: randomUUID(), activityId: course.practice, state: 'COMPLETED' })
      .expect(400);
    const restored = await api(learner).get(`/learning/courses/${course.id}`).expect(200);
    expect(restored.body.completions).toContainEqual({
      activityId: course.lesson,
      state: 'COMPLETED',
    });
  });

  it('emails scoped invitation links and enforces intended account, expiry, revocation and single acceptance', async () => {
    const f = await makeCourse(outline(), false);
    const user = await db.user.findUniqueOrThrow({ where: { id: learner.id } });
    const invite = async () => {
      const response = await api(instructor)
        .post(`/enrollments/course/${f.id}/invite`)
        .send({ email: user.email })
        .expect(201);
      const mail = await db.outboxEvent.findFirstOrThrow({
        where: { type: 'EMAIL', payload: { path: ['to'], equals: user.email } },
        orderBy: { createdAt: 'desc' },
      });
      const url = new URL((mail.payload as { text: string }).text.match(/https?:\/\/\S+/)![0]);
      expect(url.pathname).toBe('/join');
      expect(url.searchParams.get('courseId')).toBe(f.id);
      return { id: response.body.id, code: url.searchParams.get('invitationCode')! };
    };
    const revoked = await invite();
    const list = await api(instructor).get(`/enrollments/course/${f.id}/invitations`).expect(200);
    expect(list.body.items[0]).not.toHaveProperty('codeHash');
    await api(learner).get(`/enrollments/course/${f.id}/invitations`).expect(403);
    await api(unassigned).delete(`/enrollments/invitations/${revoked.id}`).expect(403);
    await api(outsider).delete(`/enrollments/invitations/${revoked.id}`).expect(404);
    await api(instructor).delete(`/enrollments/invitations/${revoked.id}`).expect(200);
    await api(instructor).delete(`/enrollments/invitations/${revoked.id}`).expect(200);
    expect(
      await db.auditEvent.count({
        where: { objectId: revoked.id, action: 'enrollment.invitation.revoked' },
      }),
    ).toBe(1);
    await api(learner)
      .post('/enrollments')
      .send({ courseId: f.id, invitationCode: revoked.code })
      .expect(404);
    const expired = await invite();
    await db.enrollmentInvitation.update({
      where: { id: expired.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await api(learner)
      .post('/enrollments')
      .send({ courseId: f.id, invitationCode: expired.code })
      .expect(404);
    const valid = await invite();
    await api(learner2)
      .post('/enrollments')
      .send({ courseId: f.id, invitationCode: valid.code })
      .expect(404);
    const accepted = await Promise.all(
      [0, 1].map(() =>
        api(learner)
          .post('/enrollments')
          .send({ courseId: f.id, invitationCode: valid.code })
          .expect(201),
      ),
    );
    expect(accepted[0].body.id).toBe(accepted[1].body.id);
    expect(
      (await db.enrollmentInvitation.findUniqueOrThrow({ where: { id: valid.id } })).acceptedAt,
    ).not.toBeNull();
    await api(instructor).delete(`/enrollments/invitations/${valid.id}`).expect(409);
  });

  it('downloads permitted text with version and expiry metadata while keeping assessment online', async () => {
    const file = await api(learner)
      .get(`/learning/activities/${course.lesson}/download`)
      .expect(200);
    expect(file.body.versionId).toBe(course.versionId);
    expect(file.body.sizeBytes).toBeGreaterThan(0);
    expect(new Date(file.body.expiresAt).getTime()).toBeGreaterThan(Date.now());
    await api(learner).get(`/learning/activities/${course.practice}/download`).expect(400);
  });

  it('downloads approved resource text from the pinned version without fetching or caching external links', async () => {
    const draft = outline();
    const text = 'Group related files. Use descriptive names. Check the saved copy.';
    draft.modules[0].activities[0].resources = [
      {
        title: 'Original checklist',
        text,
        url: 'https://127.0.0.1:1/never-fetch',
        accessible: true,
        offlineAllowed: true,
      },
      {
        title: 'Online reference',
        url: 'https://example.invalid/reference',
        accessible: true,
        offlineAllowed: false,
      },
    ];
    const fixture = await makeCourse(draft);
    await enroll(learner, fixture);
    const lesson = await api(learner).get(`/learning/activities/${fixture.lesson}`).expect(200);
    expect(lesson.body.resources).toHaveLength(2);
    expect(lesson.body.resources[0].text).toBe(text);
    const bundle = await api(learner)
      .get(`/learning/activities/${fixture.lesson}/download`)
      .expect(200);
    expect(bundle.body.versionId).toBe(fixture.versionId);
    expect(bundle.body.resources).toEqual([
      { title: 'Original checklist', text, accessible: true, offlineAllowed: true },
    ]);
    expect(bundle.body.resources[0]).not.toHaveProperty('url');
  });

  it('rejects empty, oversized and link-only offline resources and requires their accessibility review', async () => {
    const created = await api(instructor)
      .post('/courses')
      .send({
        title: 'Resource validation',
        summary: 'Original text resources',
        subject: 'Digital skills',
        level: 'Beginner',
      })
      .expect(201);
    const invalid = [
      { title: 'Empty', accessible: true, offlineAllowed: false },
      {
        title: 'Only a link',
        url: 'https://example.invalid/reference',
        accessible: true,
        offlineAllowed: true,
      },
      { title: 'Whitespace', text: '  ', accessible: true, offlineAllowed: true },
      { title: 'Too long', text: 'a'.repeat(50001), accessible: true, offlineAllowed: true },
      {
        title: 'Unsafe protocol',
        url: 'http://example.invalid/reference',
        accessible: true,
        offlineAllowed: false,
      },
    ];
    for (const resource of invalid) {
      const draft = outline();
      draft.modules[0].activities[0].resources = [resource];
      await saveOutline(created.body.id, draft, 400);
    }
    const unreviewed = outline();
    unreviewed.modules[0].activities[0].resources = [
      {
        title: 'Needs review',
        text: 'An original checklist.',
        accessible: false,
        offlineAllowed: true,
      },
    ];
    await saveOutline(created.body.id, unreviewed);
    await api(instructor).post(`/courses/${created.body.id}/publish`).expect(400);
  });

  it('protects answer keys and learner attempts while rejecting client scores', async () => {
    const start = await api(learner).post(`/assessments/${course.practice}/attempts`).expect(201);
    expect(start.body.feedback).toBeNull();
    expect(start.body.questions.every((q: any) => !('answer' in q) && !('explanation' in q))).toBe(
      true,
    );
    const again = await api(learner).post(`/assessments/${course.practice}/attempts`).expect(201);
    expect(again.body.id).toBe(start.body.id);
    await api(learner2).get(`/assessments/attempts/${start.body.id}`).expect(404);
    await api(learner2)
      .post(`/assessments/attempts/${start.body.id}/submit`)
      .send(correct(start.body))
      .expect(404);
    await api(learner)
      .post(`/assessments/attempts/${start.body.id}/submit`)
      .send({ ...correct(start.body), score: 100 })
      .expect(400);
    const result = await api(learner)
      .post(`/assessments/attempts/${start.body.id}/submit`)
      .send(correct(start.body))
      .expect(201);
    expect(result.body.score).toBe(100);
    expect(result.body.passed).toBe(true);
    expect(result.body.feedback).toHaveLength(3);
    const retried = await api(learner)
      .post(`/assessments/attempts/${start.body.id}/submit`)
      .send({ responses: [] })
      .expect(201);
    expect(retried.body.score).toBe(100);
    expect(await db.response.count({ where: { attemptId: start.body.id } })).toBe(3);
  });

  it('enforces attempt limits after refresh and scores invalid choices as incorrect', async () => {
    const start = await api(learner).post(`/assessments/${course.practice}/attempts`).expect(201);
    const result = await api(learner)
      .post(`/assessments/attempts/${start.body.id}/submit`)
      .send({
        responses: start.body.questions.map((q: any) => ({ questionId: q.id, answer: 'wrong' })),
      })
      .expect(201);
    expect(result.body.score).toBe(0);
    await api(learner).get(`/assessments/attempts/${start.body.id}`).expect(200);
    await api(learner).post(`/assessments/${course.practice}/attempts`).expect(409);
    const progress = await api(learner).get(`/learning/courses/${course.id}`).expect(200);
    expect(progress.body.completions).toContainEqual({
      activityId: course.practice,
      state: 'PASSED',
    });
  });

  it('preserves frozen questions and enrollment versions when a course is republished', async () => {
    const f = await makeCourse();
    await enroll(learner, f);
    const started = await api(learner).post(`/assessments/${f.practice}/attempts`).expect(201);
    const changed = outline();
    const changedPractice = changed.modules[0].activities.find(
      (activity) => 'assessment' in activity,
    )!;
    if (!('assessment' in changedPractice) || !changedPractice.assessment)
      throw new Error('Practice fixture missing');
    changedPractice.assessment.questions[0].answer = ['file.pdf'];
    changedPractice.assessment.questions[0].prompt = 'New version has a different question.';
    const saved = await saveOutline(f.id, changed);
    expect(saved.body.version.number).toBe(2);
    await api(instructor).post(`/courses/${f.id}/publish`).expect(201);
    const restored = await api(learner).get(`/assessments/attempts/${started.body.id}`).expect(200);
    expect(restored.body.questions[0].prompt).toBe('Choose the descriptive name.');
    const scored = await api(learner)
      .post(`/assessments/attempts/${started.body.id}/submit`)
      .send(correct(started.body))
      .expect(201);
    expect(scored.body.score).toBe(100);
    await api(learner)
      .get(`/learning/activities/${saved.body.version.modules[0].activities[0].id}`)
      .expect(404);
    expect((await api(learner).get(`/learning/courses/${f.id}`)).body.version.id).toBe(f.versionId);
  });

  it('enforces deadlines, accommodates extensions, and keeps delayed feedback private', async () => {
    const f = await makeCourse(
      outline(new Date(Date.now() - 60000).toISOString(), 'AFTER_DEADLINE'),
    );
    const enrollment = await enroll(learner, f);
    await api(learner).post(`/assessments/${f.practice}/attempts`).expect(409);
    await api(learner)
      .put(`/submissions/${f.assignment}`)
      .send({ text: 'A recoverable late draft', assetIds: [] })
      .expect(200);
    await api(learner)
      .post(`/submissions/${f.assignment}/submit`)
      .send({ requestId: randomUUID() })
      .expect(409);
    expect((await api(learner).get(`/submissions/${f.assignment}`)).body.text).toBe(
      'A recoverable late draft',
    );
    await api(instructor)
      .patch(`/enrollments/${enrollment.id}/accommodations`)
      .send({ deadlineExtension: tomorrow(), extraAttempts: 1 })
      .expect(200);
    const started = await api(learner).post(`/assessments/${f.practice}/attempts`).expect(201);
    const scored = await api(learner)
      .post(`/assessments/attempts/${started.body.id}/submit`)
      .send(correct(started.body))
      .expect(201);
    expect(scored.body.feedback).toBeNull();
    expect(
      (await api(learner).get(`/assessments/attempts/${started.body.id}`)).body.feedback,
    ).toBeNull();
    await api(learner)
      .post(`/submissions/${f.assignment}/submit`)
      .send({ requestId: randomUUID() })
      .expect(201);
  });

  it('rejects expired timed attempts and does not give them an extra retry', async () => {
    const f = await makeCourse(outline(undefined, 'NEVER', 1, 1));
    await enroll(learner, f);
    const started = await api(learner).post(`/assessments/${f.practice}/attempts`).expect(201);
    expect(started.body.expiresAt).not.toBeNull();
    // Advance only the application clock. PostgreSQL retains the real immutable
    // deadline written at attempt creation, and network/database timers stay real.
    jest.useFakeTimers({
      now: new Date(started.body.expiresAt).getTime() + 1000,
      doNotFake: [
        'hrtime',
        'nextTick',
        'performance',
        'queueMicrotask',
        'setImmediate',
        'clearImmediate',
        'setInterval',
        'clearInterval',
        'setTimeout',
        'clearTimeout',
      ],
    });
    try {
      await api(learner)
        .post(`/assessments/attempts/${started.body.id}/submit`)
        .send(correct(started.body))
        .expect(409);
      await api(learner).post(`/assessments/${f.practice}/attempts`).expect(409);
      expect(await db.attempt.count({ where: { id: started.body.id } })).toBe(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('blocks cyclic prerequisites and incomplete accessibility review', async () => {
    const draft = outline();
    draft.modules[0].activities[0].prerequisiteIds = ['practice'];
    draft.modules[0].activities[1].prerequisiteIds = ['lesson'];
    await saveOutline(course.id, draft, 400);
    const created = await api(instructor)
      .post('/courses')
      .send({
        title: 'Unready',
        summary: 'Needs review',
        subject: 'Digital skills',
        level: 'Beginner',
      })
      .expect(201);
    const bad = outline();
    bad.modules[0].activities[0].accessibility.imagesHaveAlt = false;
    await saveOutline(created.body.id, bad);
    const review = await api(instructor).get(`/courses/${created.body.id}/review`).expect(200);
    expect(review.body.canPublish).toBe(false);
    await api(instructor).post(`/courses/${created.body.id}/publish`).expect(400);
    const missing = outline() as any;
    delete missing.modules[0].activities[0].accessibility;
    await saveOutline(created.body.id, missing, 400);
  });

  it('requires passed practice prerequisites, not merely a submitted failed attempt', async () => {
    const draft = outline();
    draft.modules[0].activities[2].prerequisiteIds = ['practice'];
    const f = await makeCourse(draft);
    await enroll(learner, f);
    await api(learner).get(`/learning/activities/${f.assignment}`).expect(403);
    const started = await api(learner).post(`/assessments/${f.practice}/attempts`).expect(201);
    await api(learner)
      .post(`/assessments/attempts/${started.body.id}/submit`)
      .send({
        responses: started.body.questions.map((q: any) => ({ questionId: q.id, answer: 'wrong' })),
      })
      .expect(201);
    await api(learner).get(`/learning/activities/${f.assignment}`).expect(403);
  });

  it('keeps learner drafts private and denies another learner’s submission', async () => {
    const draft = await api(learner)
      .put(`/submissions/${course.assignment}`)
      .send({ text: 'Private draft with a folder and example email.', assetIds: [] })
      .expect(200);
    await api(instructor).get(`/grading/submissions/${draft.body.id}`).expect(404);
    await api(learner2).get(`/grading/submissions/${draft.body.id}`).expect(403);
    const other = await api(learner2).get(`/submissions/${course.assignment}`).expect(200);
    expect(other.body.id).toBeNull();
    expect(other.body.text).toBe('');
    await api(unassigned).get(`/grading/submissions/${draft.body.id}`).expect(403);
  });

  it('rejects interrupted, quarantined, foreign, or rejected files and preserves drafts', async () => {
    const asset = await db.asset.create({
      data: {
        organizationId: org,
        userId: learner.id,
        key: `test/${randomUUID()}`,
        name: 'portfolio.pdf',
        mime: 'application/pdf',
        size: 25,
        status: 'UPLOADING',
      },
    });
    await api(learner2)
      .put(`/submissions/${course.assignment}`)
      .send({ text: 'Cannot attach someone else’s file', assetIds: [asset.id] })
      .expect(400);
    await api(learner)
      .put(`/submissions/${course.assignment}`)
      .send({ text: 'Draft survives interrupted upload', assetIds: [asset.id] })
      .expect(200);
    const requestId = randomUUID();
    await api(learner)
      .post(`/submissions/${course.assignment}/submit`)
      .send({ requestId })
      .expect(409);
    await db.asset.update({ where: { id: asset.id }, data: { status: 'QUARANTINED' } });
    await api(learner)
      .post(`/submissions/${course.assignment}/submit`)
      .send({ requestId })
      .expect(409);
    const draft = await api(learner).get(`/submissions/${course.assignment}`).expect(200);
    expect(draft.body.state).toBe('DRAFT');
    expect(draft.body.receipt).toBeNull();
    await db.asset.update({ where: { id: asset.id }, data: { status: 'REJECTED' } });
    await api(learner)
      .put(`/submissions/${course.assignment}`)
      .send({ text: 'Rejected attachment', assetIds: [asset.id] })
      .expect(400);
    await api(learner)
      .put(`/submissions/${course.assignment}`)
      .send({
        text: 'A checked portfolio ready for submission',
        link: 'https://example.org/portfolio',
        assetIds: [],
      })
      .expect(200);
  });

  it('issues one durable receipt and locks submitted text on retries', async () => {
    const requestId = randomUUID();
    const results = await Promise.all([
      api(learner).post(`/submissions/${course.assignment}/submit`).send({ requestId }),
      api(learner).post(`/submissions/${course.assignment}/submit`).send({ requestId }),
    ]);
    expect(results.map((r) => r.status)).toEqual([201, 201]);
    expect(results[0].body.receipt).toBe(results[1].body.receipt);
    expect(await db.submissionReceipt.count({ where: { requestId } })).toBe(1);
    await api(learner)
      .put(`/submissions/${course.assignment}`)
      .send({ text: 'Cannot overwrite submitted work', assetIds: [] })
      .expect(409);
  });

  it('keeps grades private until release, preserves revision receipts, and deduplicates release notifications', async () => {
    const submitted = (await api(learner).get(`/submissions/${course.assignment}`)).body;
    const firstReceipt = await db.submissionReceipt.findFirstOrThrow({
      where: { submissionId: submitted.id },
      orderBy: { revision: 'asc' },
    });
    const grade = await api(instructor)
      .post(`/grading/submissions/${submitted.id}/grades`)
      .send({
        criteriaScores: [{ criterionId: 'clear', points: 5 }],
        feedback: 'Add dates to your filenames and try again.',
        revisionRequested: true,
      })
      .expect(201);
    expect((await api(learner).get(`/submissions/${course.assignment}`)).body.grades).toEqual([]);
    expect(
      (await api(learner).get('/learning/home')).body.feedback.some(
        (g: any) => g.id === grade.body.id,
      ),
    ).toBe(false);
    await api(admin).post(`/grading/grades/${grade.body.id}/release`).expect(403);
    await Promise.all([
      api(instructor).post(`/grading/grades/${grade.body.id}/release`).expect(201),
      api(instructor).post(`/grading/grades/${grade.body.id}/release`).expect(201),
    ]);
    expect(await db.notification.count({ where: { eventId: `grade:${grade.body.id}` } })).toBe(1);
    const feedback = await api(learner).get(`/submissions/${course.assignment}`).expect(200);
    expect(feedback.body.state).toBe('REVISION_REQUESTED');
    expect(feedback.body.grades[0].feedback).toContain('Add dates');
    const revision = await api(learner)
      .put(`/submissions/${course.assignment}`)
      .send({ text: 'Revised portfolio with 2026-10-25_receipt.pdf', assetIds: [] })
      .expect(200);
    expect(revision.body.revision).toBe(2);
    const oldRetry = await api(learner)
      .post(`/submissions/${course.assignment}/submit`)
      .send({ requestId: firstReceipt.requestId })
      .expect(201);
    expect(oldRetry.body.revision).toBe(1);
    expect((await api(learner).get(`/submissions/${course.assignment}`)).body.state).toBe('DRAFT');
    const second = await api(learner)
      .post(`/submissions/${course.assignment}/submit`)
      .send({ requestId: randomUUID() })
      .expect(201);
    expect(second.body.receipt).not.toBe(firstReceipt.receipt);
    expect(await db.submissionReceipt.count({ where: { submissionId: submitted.id } })).toBe(2);
    const finalGrade = await api(instructor)
      .post(`/grading/submissions/${submitted.id}/grades`)
      .send({
        criteriaScores: [{ criterionId: 'clear', points: 9 }],
        feedback: 'The dates and descriptive names make this easy to follow.',
      })
      .expect(201);
    expect(finalGrade.body.submissionRevision).toBe(2);
    await api(instructor).post(`/grading/grades/${finalGrade.body.id}/release`).expect(201);
    const final = await api(learner).get(`/submissions/${course.assignment}`).expect(200);
    expect(final.body.grades).toHaveLength(2);
    expect(final.body.grades[0].passed).toBe(true);
    const history = await api(instructor).get(`/grading/submissions/${submitted.id}`).expect(200);
    expect(history.body.history[1].snapshot.text).toBe('A checked portfolio ready for submission');
    expect((await api(learner).get(`/learning/courses/${course.id}`)).body.enrollment.state).toBe(
      'COMPLETED',
    );
  });

  it('validates rubric scores and makes revoked course assignment effective immediately', async () => {
    const submitted = (await api(learner).get(`/submissions/${course.assignment}`)).body;
    await api(instructor)
      .post(`/grading/submissions/${submitted.id}/grades`)
      .send({
        criteriaScores: [{ criterionId: 'clear', points: 11 }],
        feedback: 'Invalid above rubric maximum',
      })
      .expect(400);
    await db.courseAssignment.delete({
      where: { userId_courseId: { userId: instructor.id, courseId: course.id } },
    });
    await api(instructor).get(`/grading/submissions/${submitted.id}`).expect(403);
    await api(instructor).get(`/courses/${course.id}/editor`).expect(403);
  });

  it('paginates scoped enrollments, invitations and reports with whole-course completion totals', async () => {
    const fixture = await makeCourse();
    await enroll(learner, fixture);
    await enroll(learner2, fixture);
    await api(learner2)
      .post('/learning/progress')
      .send({ eventId: randomUUID(), activityId: fixture.lesson, state: 'COMPLETED' })
      .expect(201);
    const practice = await api(learner2)
      .post(`/assessments/${fixture.practice}/attempts`)
      .expect(201);
    await api(learner2)
      .post(`/assessments/attempts/${practice.body.id}/submit`)
      .send(correct(practice.body))
      .expect(201);
    await api(learner2)
      .put(`/submissions/${fixture.assignment}`)
      .send({ text: 'My original portfolio.', assetIds: [] })
      .expect(200);
    const submitted = await api(learner2)
      .post(`/submissions/${fixture.assignment}/submit`)
      .send({ requestId: randomUUID() })
      .expect(201);
    const grade = await api(instructor)
      .post(`/grading/submissions/${submitted.body.id}/grades`)
      .send({
        criteriaScores: [{ criterionId: 'clear', points: 10 }],
        feedback: 'Clear and complete.',
      })
      .expect(201);
    await api(instructor).post(`/grading/grades/${grade.body.id}/release`).expect(201);

    const first = await api(instructor)
      .get(`/enrollments/course/${fixture.id}?page=1&limit=1`)
      .expect(200);
    const second = await api(instructor)
      .get(`/enrollments/course/${fixture.id}?page=2&limit=1`)
      .expect(200);
    expect(first.body).toMatchObject({ page: 1, limit: 1, total: 2 });
    expect(second.body).toMatchObject({ page: 2, limit: 1, total: 2 });
    expect(first.body.items).toHaveLength(1);
    expect(second.body.items[0].id).not.toBe(first.body.items[0].id);
    expect(
      (await api(instructor).get(`/enrollments/course/${fixture.id}?page=3&limit=1`)).body.items,
    ).toEqual([]);
    const report = await api(instructor)
      .get(`/reporting/courses/${fixture.id}?page=1&limit=1`)
      .expect(200);
    expect(report.body).toMatchObject({ page: 1, limit: 1, total: 2, completed: 1 });
    expect(report.body.items).toHaveLength(1);
    expect(report.body.items[0].learner.id).toBe(learner.id);

    for (let index = 0; index < 3; index++)
      await api(instructor)
        .post(`/enrollments/course/${fixture.id}/invite`)
        .send({ email: `${randomUUID()}@pagination.invalid` })
        .expect(201);
    const invitationPage = await api(instructor)
      .get(`/enrollments/course/${fixture.id}/invitations?page=2&limit=2`)
      .expect(200);
    expect(invitationPage.body).toMatchObject({ page: 2, limit: 2, total: 3 });
    expect(invitationPage.body.items).toHaveLength(1);
    await api(instructor).get(`/enrollments/course/${fixture.id}?page=0`).expect(400);
    await api(instructor)
      .get(`/enrollments/course/${fixture.id}/invitations?limit=101`)
      .expect(400);
    await api(instructor).get(`/reporting/courses/${fixture.id}?limit=1000`).expect(400);
    await api(outsider).get(`/enrollments/course/${fixture.id}?page=2`).expect(404);
  });

  it('enforces published evidence, attempt snapshots, receipt durability and enrollment scope in PostgreSQL', async () => {
    const module = await db.module.findFirstOrThrow({
      where: { courseVersionId: course.versionId },
    });
    await expect(
      db.courseVersion.update({
        where: { id: course.versionId },
        data: { title: 'Tampered title' },
      }),
    ).rejects.toThrow('Published content is immutable');
    await expect(
      db.module.update({ where: { id: module.id }, data: { title: 'Tampered module' } }),
    ).rejects.toThrow('Published content is immutable');
    await expect(
      db.activityVersion.update({
        where: { id: course.lesson },
        data: { body: 'Tampered lesson' },
      }),
    ).rejects.toThrow('Published content is immutable');
    const attempt = await db.attempt.findFirstOrThrow({
      where: { enrollment: { userId: learner.id, courseId: course.id } },
    });
    await expect(
      db.attempt.update({ where: { id: attempt.id }, data: { frozenQuestions: [] } }),
    ).rejects.toThrow('Attempt evidence and timing are immutable');
    await expect(
      db.attempt.update({ where: { id: attempt.id }, data: { expiresAt: new Date() } }),
    ).rejects.toThrow('Attempt evidence and timing are immutable');
    const receipt = await db.submissionReceipt.findFirstOrThrow({
      where: { submission: { enrollment: { userId: learner.id, courseId: course.id } } },
    });
    await expect(
      db.submissionReceipt.update({ where: { id: receipt.id }, data: { snapshot: {} } }),
    ).rejects.toThrow('Submission receipts are immutable');
    const other = await makeCourse();
    const enrollment = await enroll(learner, other);
    await expect(
      db.progressEvent.create({
        data: {
          id: randomUUID(),
          enrollmentId: enrollment.id,
          activityId: course.lesson,
          state: 'COMPLETED',
        },
      }),
    ).rejects.toThrow('Learning records must reference the enrolled content version');
    await expect(
      db.enrollment.update({
        where: { id: enrollment.id },
        data: { courseVersionId: course.versionId },
      }),
    ).rejects.toThrow('Enrollment must reference a published version of its course');
  });
});
