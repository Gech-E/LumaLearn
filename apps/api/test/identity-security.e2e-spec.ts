import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import request from 'supertest';
import { authenticator } from 'otplib';
import { PrismaService } from '../src/database/prisma.service';
import { configureApp } from '../src/bootstrap';
import { deliverOutbox, recordJobFailure } from '../src/jobs/outbox';
import { sealSecret, token, tokenHash } from '../src/auth/auth.crypto';
import type { Role } from '@prisma/client';
import { bootstrapOrganization } from '../src/operations/bootstrap.service';

const database = process.env.TEST_DATABASE_URL;
const run = database ? describe : describe.skip;
run('identity, organization boundaries, and durable jobs on PostgreSQL', () => {
  let app: INestApplication;
  let db: PrismaService;
  const organizationId = `identity-${randomUUID()}`;
  const otherOrganizationId = `identity-other-${randomUUID()}`;
  const organizationIds = [organizationId, otherOrganizationId];
  const userIds: string[] = [];
  const password = 'IdentityTestPassword!2026';
  let learner: { id: string; email: string; membershipId: string };
  let admin: { id: string; email: string; membershipId: string };
  let outsider: { id: string; email: string; membershipId: string };
  let adminCookie: string;
  let adminCsrf: string;
  async function account(roles: Role[], org = organizationId) {
    const id = randomUUID();
    userIds.push(id);
    const user = await db.user.create({
      data: {
        id,
        email: `${id}@identity.test`,
        name: 'Security test account',
        verifiedAt: new Date(),
        passwordHash: await argon2.hash(password),
        memberships: {
          create: { organizationId: org, roles: { create: roles.map((role) => ({ role })) } },
        },
      },
      include: { memberships: true },
    });
    return { id, email: user.email, membershipId: user.memberships[0].id };
  }
  async function session(
    user: { id: string; membershipId: string },
    expiresAt = new Date(Date.now() + 3600000),
  ) {
    const raw = token();
    const csrf = token();
    await db.session.create({
      data: {
        userId: user.id,
        membershipId: user.membershipId,
        tokenHash: tokenHash(raw),
        csrfToken: csrf,
        expiresAt,
        mfaVerified: true,
      },
    });
    return { cookie: `pathway_session=${raw}`, csrf };
  }
  beforeAll(async () => {
    if (!database || !new URL(database).pathname.includes('test'))
      throw new Error('Identity integration tests require a dedicated test database');
    process.env.NODE_ENV = 'test';
    const { AppModule } = await import('../src/app.module');
    db = new PrismaService({ datasources: { db: { url: database } } });
    await db.$connect();
    await db.organization.createMany({
      data: [
        { id: organizationId, name: 'Identity fixture' },
        { id: otherOrganizationId, name: 'Other identity fixture' },
      ],
    });
    learner = await account(['LEARNER']);
    admin = await account(['ADMIN']);
    outsider = await account(['LEARNER'], otherOrganizationId);
    // A confirmed second factor is required even for test fixture admin sessions.
    await db.user.update({
      where: { id: admin.id },
      data: { mfaSecret: 'fixture-not-used-for-login' },
    });
    const adminSession = await session(admin);
    adminCookie = adminSession.cookie;
    adminCsrf = adminSession.csrf;
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(db)
      .compile();
    app = module.createNestApplication({ bodyParser: false });
    configureApp(app);
    await app.init();
  });
  afterAll(async () => {
    if (!db) return;
    const bootstrapUsers = await db.user.findMany({
      where: { memberships: { some: { organizationId: { in: organizationIds.slice(2) } } } },
      select: { id: true },
    });
    userIds.push(...bootstrapUsers.map((user) => user.id));
    await db.notification.deleteMany({
      where: { organizationId: { in: organizationIds } },
    });
    await db.supportRequest.deleteMany({
      where: { organizationId: { in: organizationIds } },
    });
    await db.auditEvent.deleteMany({
      where: { organizationId: { in: organizationIds } },
    });
    await db.outboxEvent.deleteMany({
      where: {
        OR: organizationIds.map((id) => ({ payload: { path: ['organizationId'], equals: id } })),
      },
    });
    await db.contactToken.deleteMany({ where: { userId: { in: userIds } } });
    await db.session.deleteMany({ where: { userId: { in: userIds } } });
    await db.membership.deleteMany({ where: { userId: { in: userIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.organization.deleteMany({
      where: { id: { in: organizationIds } },
    });
    await app?.close();
    await db.$disconnect();
  });
  test('public account delivery guidance omits infrastructure details outside development', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/auth/delivery').expect(200);
    expect(response.body).toEqual({ mode: 'email' });
  });

  test('operator bootstrap is atomic under retry and requires contact verification and MFA before administration', async () => {
    const id = `bootstrap-${randomUUID()}`;
    organizationIds.push(id);
    const input = {
      organizationId: id,
      organizationName: 'New provider fixture',
      email: `${randomUUID()}@bootstrap.invalid`,
      name: 'Initial administrator',
      password: 'FictionalBootstrapPassword!2026',
      academicAccess: false,
    };
    const concurrent = await Promise.allSettled([
      bootstrapOrganization(db, input),
      bootstrapOrganization(db, input),
    ]);
    expect(concurrent.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(concurrent.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const user = await db.user.findUniqueOrThrow({
      where: { email: input.email },
      include: { memberships: { include: { roles: true } } },
    });
    expect(user.verifiedAt).toBeNull();
    expect(user.mfaSecret).toBeNull();
    expect(user.memberships[0].roles.map((role) => role.role)).toEqual(['ADMIN']);
    expect(user.passwordHash).not.toBe(input.password);
    expect(await argon2.verify(user.passwordHash, input.password)).toBe(true);
    const audit = await db.auditEvent.findMany({ where: { organizationId: id } });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      action: 'organization.bootstrapped',
      actorId: user.id,
      objectId: id,
    });
    const emails = await db.outboxEvent.findMany({
      where: { payload: { path: ['organizationId'], equals: id } },
    });
    expect(emails).toHaveLength(1);
    const payload = emails[0].payload as { to: string; text: string };
    expect(payload.to).toBe(input.email);
    expect(payload.text).not.toContain(input.password);
    const verificationUrl = payload.text.match(/https?:\/\/\S+/)?.[0];
    expect(verificationUrl).toBeDefined();
    const verificationToken = new URL(verificationUrl!).searchParams.get('token')!;
    expect(
      await db.contactToken.count({
        where: { userId: user.id, tokenHash: tokenHash(verificationToken), kind: 'VERIFY' },
      }),
    ).toBe(1);

    const signedIn = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: input.email, password: input.password })
      .expect(201);
    const cookie = signedIn.headers['set-cookie'][0].split(';')[0];
    expect(signedIn.body.mfaRequired).toBe(true);
    const unverified = await request(app.getHttpServer())
      .get('/api/v1/memberships')
      .set('Cookie', cookie)
      .expect(403);
    expect(unverified.body.code).toBe('CONTACT_UNVERIFIED');
    await request(app.getHttpServer())
      .post('/api/v1/auth/verify')
      .send({ token: verificationToken })
      .expect(201);
    const withoutMfa = await request(app.getHttpServer())
      .get('/api/v1/memberships')
      .set('Cookie', cookie)
      .expect(403);
    expect(withoutMfa.body.code).toBe('MFA_REQUIRED');
    const setup = await request(app.getHttpServer())
      .post('/api/v1/auth/mfa/setup')
      .set('Cookie', cookie)
      .set('X-CSRF-Token', signedIn.body.csrfToken)
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/auth/mfa/enable')
      .set('Cookie', cookie)
      .set('X-CSRF-Token', signedIn.body.csrfToken)
      .send({ code: authenticator.generate(setup.body.secret) })
      .expect(201);
    await request(app.getHttpServer()).get('/api/v1/memberships').set('Cookie', cookie).expect(200);
    const academicWork = await request(app.getHttpServer())
      .get('/api/v1/grading/submissions')
      .set('Cookie', cookie)
      .expect(200);
    expect(academicWork.body.items).toEqual([]);
  });

  test('bootstrap refuses existing organization and account targets without changing them; academic access is explicit', async () => {
    const id = `bootstrap-academic-${randomUUID()}`;
    const untouchedId = `bootstrap-unused-${randomUUID()}`;
    organizationIds.push(id, untouchedId);
    const input = {
      organizationId: id,
      organizationName: 'Academic provider fixture',
      email: `${randomUUID()}@bootstrap.invalid`,
      name: 'Academic administrator',
      password: 'FictionalBootstrapPassword!2026',
      academicAccess: true,
    };
    await bootstrapOrganization(db, input);
    const original = await db.user.findUniqueOrThrow({
      where: { email: input.email },
      include: { memberships: { include: { roles: true } } },
    });
    expect(original.memberships[0].roles.map((role) => role.role).sort()).toEqual([
      'ACADEMIC_ADMIN',
      'ADMIN',
    ]);
    await expect(
      bootstrapOrganization(db, { ...input, organizationId: untouchedId }),
    ).rejects.toThrow('already exists');
    expect(await db.organization.findUnique({ where: { id: untouchedId } })).toBeNull();
    const differentEmail = `${randomUUID()}@bootstrap.invalid`;
    await expect(
      bootstrapOrganization(db, {
        ...input,
        email: differentEmail,
        organizationName: 'Must not replace',
        password: 'MustNotReplacePassword!2026',
      }),
    ).rejects.toThrow('already exists');
    expect(await db.user.findUnique({ where: { email: differentEmail } })).toBeNull();
    expect((await db.organization.findUniqueOrThrow({ where: { id } })).name).toBe(
      input.organizationName,
    );
    expect((await db.user.findUniqueOrThrow({ where: { id: original.id } })).passwordHash).toBe(
      original.passwordHash,
    );
    expect(
      await db.auditEvent.count({
        where: { organizationId: id, action: 'organization.bootstrapped' },
      }),
    ).toBe(1);
  });

  test('real password login sets an HttpOnly cookie and rejects unknown input', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: learner.email, password })
      .expect(201);
    expect(response.headers['set-cookie'][0]).toMatch(/HttpOnly/);
    expect(response.headers['set-cookie'][0]).toMatch(/SameSite=Lax/);
    expect(response.body.user).not.toHaveProperty('passwordHash');
    expect(response.body.csrfToken.length).toBeGreaterThan(30);
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: learner.email, password, role: 'ADMIN' })
      .expect(400);
  });
  test('cookie mutations require CSRF and reject untrusted Origin', async () => {
    const s = await session(learner);
    await request(app.getHttpServer())
      .patch('/api/v1/users/me')
      .set('Cookie', s.cookie)
      .send({ name: 'New name' })
      .expect(403);
    await request(app.getHttpServer())
      .patch('/api/v1/users/me')
      .set('Cookie', s.cookie)
      .set('X-CSRF-Token', s.csrf)
      .set('Origin', 'https://attacker.example')
      .send({ name: 'New name' })
      .expect(403);
    await request(app.getHttpServer())
      .patch('/api/v1/users/me')
      .set('Cookie', s.cookie)
      .set('X-CSRF-Token', s.csrf)
      .send({ name: 'Updated name' })
      .expect(200);
  });
  test('membership suspension and session expiry deny protected access', async () => {
    const user = await account(['LEARNER']);
    const s = await session(user);
    await db.membership.update({ where: { id: user.membershipId }, data: { state: 'SUSPENDED' } });
    await request(app.getHttpServer()).get('/api/v1/users/me').set('Cookie', s.cookie).expect(403);
    const expired = await session(learner, new Date(Date.now() - 1000));
    await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Cookie', expired.cookie)
      .expect(401);
  });
  test('cross-organization role changes and academic privilege escalation are denied', async () => {
    const patch = (id: string, body: object) =>
      request(app.getHttpServer())
        .patch(`/api/v1/memberships/${id}`)
        .set('Cookie', adminCookie)
        .set('X-CSRF-Token', adminCsrf)
        .send(body);
    await patch(outsider.membershipId, { state: 'SUSPENDED' }).expect(404);
    await patch(learner.membershipId, { roles: ['ACADEMIC_ADMIN'] }).expect(403);
    await patch(admin.membershipId, { roles: ['ADMIN', 'ACADEMIC_ADMIN'] }).expect(403);
  });
  test('single-use recovery revokes all sessions and does not disclose unknown accounts', async () => {
    const user = await account(['LEARNER']);
    const old = await session(user);
    const known = await request(app.getHttpServer())
      .post('/api/v1/auth/recover')
      .send({ email: user.email })
      .expect(201);
    const unknown = await request(app.getHttpServer())
      .post('/api/v1/auth/recover')
      .send({ email: `${randomUUID()}@unknown.test` })
      .expect(201);
    expect(known.body).toEqual(unknown.body);
    const event = await db.outboxEvent.findFirstOrThrow({
      where: { type: 'EMAIL', payload: { path: ['to'], equals: user.email } },
      orderBy: { createdAt: 'desc' },
    });
    const text = (event.payload as { text: string }).text;
    const link = text.match(/https?:\/\/\S+/)![0];
    const recoveryToken = new URL(link).searchParams.get('token');
    await request(app.getHttpServer())
      .post('/api/v1/auth/reset')
      .send({ token: recoveryToken, password: 'AnotherSecurePassword!2026' })
      .expect(201);
    await request(app.getHttpServer())
      .get('/api/v1/auth/session')
      .set('Cookie', old.cookie)
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/auth/reset')
      .send({ token: recoveryToken, password })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: user.email, password })
      .expect(401);
  });
  test('privileged sign-in requires MFA setup and consumes each TOTP only once', async () => {
    const user = await account(['INSTRUCTOR']);
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: user.email, password })
      .expect(201);
    expect(login.body.mfaRequired).toBe(true);
    const cookie = login.headers['set-cookie'][0].split(';')[0];
    const csrf = login.body.csrfToken as string;
    await request(app.getHttpServer())
      .get('/api/v1/notifications')
      .set('Cookie', cookie)
      .expect(403);
    const setup = await request(app.getHttpServer())
      .post('/api/v1/auth/mfa/setup')
      .set('Cookie', cookie)
      .set('X-CSRF-Token', csrf)
      .send({})
      .expect(201);
    const code = authenticator.generate(setup.body.secret);
    await request(app.getHttpServer())
      .post('/api/v1/auth/mfa/enable')
      .set('Cookie', cookie)
      .set('X-CSRF-Token', csrf)
      .send({ code })
      .expect(201);
    const identity = await request(app.getHttpServer())
      .get('/api/v1/auth/session')
      .set('Cookie', cookie)
      .expect(200);
    expect(identity.body.mfaRequired).toBe(false);
    await request(app.getHttpServer())
      .get('/api/v1/notifications')
      .set('Cookie', cookie)
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: user.email, password, totp: code })
      .expect(401);
    const clock = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 60000);
    try {
      const nextCode = authenticator.generate(setup.body.secret);
      const concurrent = await Promise.all(
        [0, 1].map(() =>
          request(app.getHttpServer())
            .post('/api/v1/auth/login')
            .send({ email: user.email, password, totp: nextCode }),
        ),
      );
      expect(concurrent.map((result) => result.status).sort()).toEqual([201, 401]);
    } finally {
      clock.mockRestore();
    }
  });
  test('password recovery invalidates an old-password sign-in already verifying credentials', async () => {
    const user = await account(['LEARNER']);
    const stored = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    await request(app.getHttpServer())
      .post('/api/v1/auth/recover')
      .send({ email: user.email })
      .expect(201);
    const mail = await db.outboxEvent.findFirstOrThrow({
      where: { type: 'EMAIL', payload: { path: ['to'], equals: user.email } },
      orderBy: { createdAt: 'desc' },
    });
    const resetToken = new URL(
      (mail.payload as { text: string }).text.match(/https?:\/\/\S+/)![0],
    ).searchParams.get('token');
    let verified!: () => void;
    let resume!: () => void;
    const reachedVerification = new Promise<void>((resolve) => {
      verified = resolve;
    });
    const resumeVerification = new Promise<void>((resolve) => {
      resume = resolve;
    });
    const originalVerify = argon2.verify;
    const verification = jest
      .spyOn(argon2, 'verify')
      .mockImplementation(async (digest, plaintext, options) => {
        const result = await originalVerify(digest, plaintext, options);
        if (digest === stored.passwordHash) {
          verified();
          await resumeVerification;
        }
        return result;
      });
    const pending = request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: user.email, password })
      .then((response) => response);
    try {
      await reachedVerification;
      await request(app.getHttpServer())
        .post('/api/v1/auth/reset')
        .send({ token: resetToken, password: 'ChangedWhileSigningIn!2026' })
        .expect(201);
      resume();
      const response = await pending;
      expect(response.status).toBe(401);
      expect(response.body.code).toBe('CREDENTIALS_CHANGED');
      expect(await db.session.count({ where: { userId: user.id, revokedAt: null } })).toBe(0);
    } finally {
      resume();
      verification.mockRestore();
    }
  });
  test('MFA recovery codes require a verified factor and password, store only hashes, and consume once under concurrent login', async () => {
    const user = await account(['INSTRUCTOR']);
    await db.user.update({
      where: { id: user.id },
      data: { mfaSecret: sealSecret(authenticator.generateSecret()) },
    });
    const current = await session(user);
    const generate = (inputPassword = password) =>
      request(app.getHttpServer())
        .post('/api/v1/auth/mfa/recovery-codes')
        .set('Cookie', current.cookie)
        .set('X-CSRF-Token', current.csrf)
        .send({ password: inputPassword });
    await generate('AnIncorrectPassword!2026').expect(401);
    expect(await db.mfaRecoveryCode.count({ where: { userId: user.id } })).toBe(0);
    const generated = await generate().expect(201);
    const codes = generated.body.codes as string[];
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    expect(codes.every((code) => /^(?:[a-f0-9]{4}-){7}[a-f0-9]{4}$/.test(code))).toBe(true);
    const stored = await db.mfaRecoveryCode.findMany({ where: { userId: user.id } });
    expect(stored).toHaveLength(10);
    expect(stored.every((code) => /^[a-f0-9]{64}$/.test(code.codeHash))).toBe(true);
    expect(stored.some((code) => code.codeHash === tokenHash(codes[0].replace(/-/g, '')))).toBe(
      true,
    );
    expect(JSON.stringify(stored)).not.toContain(codes[0]);
    const login = (code: string, inputPassword = password) =>
      request(app.getHttpServer()).post('/api/v1/auth/login').send({
        email: user.email,
        password: inputPassword,
        recoveryCode: code,
      });
    await login(codes[0], 'WrongPassword!2026').expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: user.email,
        password,
        recoveryCode: codes[0],
        totp: '123456',
      })
      .expect(400);
    const concurrent = await Promise.all([login(codes[0]), login(codes[0].toUpperCase())]);
    expect(concurrent.map((result) => result.status).sort()).toEqual([201, 401]);
    const successful = concurrent.find((result) => result.status === 201)!;
    expect(successful.body.mfaRequired).toBe(false);
    const signedInCookie = successful.headers['set-cookie'][0].split(';')[0];
    const identity = await request(app.getHttpServer())
      .get('/api/v1/auth/session')
      .set('Cookie', signedInCookie)
      .expect(200);
    expect(identity.body.mfaRequired).toBe(false);
    expect(
      await db.mfaRecoveryCode.count({ where: { userId: user.id, usedAt: { not: null } } }),
    ).toBe(1);
    await login(codes[0]).expect(401);
    const regenerated = await generate().expect(201);
    expect(regenerated.body.codes).not.toContain(codes[1]);
    expect(await db.mfaRecoveryCode.count({ where: { userId: user.id } })).toBe(10);
    await login(codes[1]).expect(401);
    await login(regenerated.body.codes[0]).expect(201);
    const audit = await db.auditEvent.findMany({ where: { actorId: user.id } });
    expect(audit.filter((event) => event.action === 'auth.mfa.recovery-used')).toHaveLength(2);
    expect(
      await db.notification.count({
        where: { userId: user.id, title: 'A recovery code was used to sign in' },
      }),
    ).toBe(2);
    expect(JSON.stringify(audit)).not.toContain(codes[0]);
    expect(generated.headers['cache-control']).toBe('no-store');
  });
  test('MFA recovery code generation rejects missing CSRF, an incomplete MFA session, or an account without MFA', async () => {
    const user = await account(['LEARNER']);
    const current = await session(user);
    await request(app.getHttpServer())
      .post('/api/v1/auth/mfa/recovery-codes')
      .set('Cookie', current.cookie)
      .set('X-CSRF-Token', current.csrf)
      .send({ password })
      .expect(403);
    await db.user.update({
      where: { id: user.id },
      data: { mfaSecret: sealSecret(authenticator.generateSecret()) },
    });
    await request(app.getHttpServer())
      .post('/api/v1/auth/mfa/recovery-codes')
      .set('Cookie', current.cookie)
      .send({ password })
      .expect(403);
    await db.session.updateMany({ where: { userId: user.id }, data: { mfaVerified: false } });
    await request(app.getHttpServer())
      .post('/api/v1/auth/mfa/recovery-codes')
      .set('Cookie', current.cookie)
      .set('X-CSRF-Token', current.csrf)
      .send({ password })
      .expect(403);
    expect(await db.mfaRecoveryCode.count({ where: { userId: user.id } })).toBe(0);
  });
  test('privacy requests remain scoped and auditable, with bounded exports that omit security material', async () => {
    const user = await account(['LEARNER']);
    const otherLearner = await account(['LEARNER']);
    const foreignSupport = await account(['SUPPORT'], otherOrganizationId);
    await db.user.update({
      where: { id: foreignSupport.id },
      data: { mfaSecret: sealSecret(authenticator.generateSecret()) },
    });
    const current = await session(user);
    const otherSession = await session(otherLearner);
    const outsiderSession = await session(outsider);
    const foreignSupportSession = await session(foreignSupport);
    const create = (kind?: string) =>
      request(app.getHttpServer())
        .post('/api/v1/support')
        .set('Cookie', current.cookie)
        .set('X-CSRF-Token', current.csrf)
        .send({
          kind,
          subject: 'My privacy request',
          message: 'Please review my account data request.',
        });
    const exportRequest = await create('EXPORT').expect(201);
    const deletionRequest = await create('DELETION').expect(201);
    const helpRequest = await create().expect(201);
    expect(helpRequest.body.kind).toBe('HELP');
    expect(deletionRequest.body.status).toBe('OPEN');
    expect(await db.user.count({ where: { id: user.id } })).toBe(1);
    await create('INVALID').expect(400);
    await request(app.getHttpServer())
      .post('/api/v1/support')
      .set('Cookie', current.cookie)
      .set('X-CSRF-Token', current.csrf)
      .send({
        kind: 'EXPORT',
        subject: 'Spoofed scope request',
        message: 'This request supplies another account.',
        userId: otherLearner.id,
      })
      .expect(400);
    const ownList = await request(app.getHttpServer())
      .get('/api/v1/support')
      .set('Cookie', current.cookie)
      .expect(200);
    expect(ownList.body.total).toBe(3);
    const unrelatedList = await request(app.getHttpServer())
      .get('/api/v1/support')
      .set('Cookie', otherSession.cookie)
      .expect(200);
    expect(unrelatedList.body.total).toBe(0);
    await request(app.getHttpServer())
      .patch(`/api/v1/support/${exportRequest.body.id}`)
      .set('Cookie', current.cookie)
      .set('X-CSRF-Token', current.csrf)
      .send({ status: 'RESOLVED', response: 'Cannot resolve my own request as a learner.' })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/api/v1/support/${exportRequest.body.id}`)
      .set('Cookie', foreignSupportSession.cookie)
      .set('X-CSRF-Token', foreignSupportSession.csrf)
      .send({
        status: 'RESOLVED',
        response: 'A different organization cannot handle this request.',
      })
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/api/v1/support/${exportRequest.body.id}`)
      .set('Cookie', adminCookie)
      .set('X-CSRF-Token', adminCsrf)
      .send({
        status: 'IN_PROGRESS',
        response: 'We are reviewing the export scope and retention rules.',
      })
      .expect(200);
    expect(
      await db.auditEvent.count({
        where: { objectId: exportRequest.body.id, action: 'privacy.requested' },
      }),
    ).toBe(1);
    expect(
      await db.auditEvent.count({
        where: { objectId: exportRequest.body.id, action: 'support.responded' },
      }),
    ).toBe(1);
    const first = await request(app.getHttpServer())
      .get('/api/v1/users/me/export?page=1&limit=1')
      .set('Cookie', current.cookie)
      .expect(200);
    expect(first.body.profile.id).toBe(user.id);
    expect(first.body.membership.organizationId).toBe(organizationId);
    expect(first.body.support).toMatchObject({ total: 3, page: 1, limit: 1 });
    expect(first.body.support.items).toHaveLength(1);
    const second = await request(app.getHttpServer())
      .get('/api/v1/users/me/export?page=2&limit=1')
      .set('Cookie', current.cookie)
      .expect(200);
    expect(second.body.support.items[0].id).not.toBe(first.body.support.items[0].id);
    const encoded = JSON.stringify(first.body);
    for (const privateField of [
      'passwordHash',
      'mfaSecret',
      'mfaPendingSecret',
      'csrfToken',
      'tokenHash',
      'recoveryCode',
      'frozenQuestions',
    ])
      expect(encoded).not.toContain(privateField);
    const unrelatedExport = await request(app.getHttpServer())
      .get('/api/v1/users/me/export')
      .set('Cookie', outsiderSession.cookie)
      .expect(200);
    expect(unrelatedExport.body.support.total).toBe(0);
    expect(JSON.stringify(unrelatedExport.body)).not.toContain(exportRequest.body.id);
    await request(app.getHttpServer()).get('/api/v1/users/me/export').expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/users/me/export?limit=101')
      .set('Cookie', current.cookie)
      .expect(400);
    expect(first.headers['cache-control']).toBe('no-store');
    expect(
      await db.auditEvent.count({ where: { actorId: user.id, action: 'privacy.exported' } }),
    ).toBe(2);
  });
  test('concurrent notice replay creates one notification per active member', async () => {
    const event = await db.outboxEvent.create({
      data: {
        type: 'SERVICE_NOTICE',
        payload: { organizationId, title: 'Service notice', body: 'An essential service update.' },
      },
    });
    await Promise.all([deliverOutbox(db, event.id), deliverOutbox(db, event.id)]);
    const active = await db.membership.count({ where: { organizationId, state: 'ACTIVE' } });
    expect(await db.notification.count({ where: { eventId: { startsWith: event.id } } })).toBe(
      active,
    );
    expect((await db.outboxEvent.findUniqueOrThrow({ where: { id: event.id } })).status).toBe(
      'DONE',
    );
    await recordJobFailure(db, event.id, true);
    expect((await db.outboxEvent.findUniqueOrThrow({ where: { id: event.id } })).status).toBe(
      'DONE',
    );
  });
});
