import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { authenticator } from 'otplib';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import { AuthUser } from './auth.decorators';
import { LoginDto, RegisterDto, ResetDto } from './auth.dto';
import { openSecret, sealSecret, token, tokenHash } from './auth.crypto';
import { privileged } from './auth.guard';

const neutralMessage = {
  message:
    'If this email is eligible for these account instructions, delivery has been requested. Check your inbox shortly.',
};
@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}
  private async issueContact(
    tx: Prisma.TransactionClient,
    userId: string,
    email: string,
    kind: 'VERIFY' | 'RECOVER',
  ) {
    // Concurrent resend requests must leave only the latest link usable.
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
    const raw = token();
    await tx.contactToken.updateMany({
      where: { userId, kind, usedAt: null },
      data: { usedAt: new Date() },
    });
    await tx.contactToken.create({
      data: {
        userId,
        kind,
        tokenHash: tokenHash(raw),
        expiresAt: new Date(Date.now() + (kind === 'VERIFY' ? 24 * 3600 : 1800) * 1000),
      },
    });
    const url = new URL(
      kind === 'VERIFY' ? '/verify' : '/reset-password',
      (process.env.WEB_ORIGIN ?? 'http://localhost:3000').split(',')[0],
    );
    url.searchParams.set('token', raw);
    const membership = await tx.membership.findFirst({
      where: { userId, state: 'ACTIVE' },
      orderBy: { id: 'asc' },
      select: { organizationId: true },
    });
    await tx.outboxEvent.create({
      data: {
        type: 'EMAIL',
        payload: {
          organizationId:
            membership?.organizationId ?? process.env.DEFAULT_ORGANIZATION_ID ?? 'org-pathway',
          to: email,
          subject: kind === 'VERIFY' ? 'Verify your Pathway email' : 'Reset your Pathway password',
          text: `Open this link to ${kind === 'VERIFY' ? 'verify your email' : 'choose a new password'}: ${url.toString()}\nIf you did not request this, you can ignore it.`,
        },
      },
    });
  }
  async register(input: RegisterDto) {
    const email = input.email.trim().toLowerCase();
    const passwordHash = await argon2.hash(input.password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 1,
    });
    try {
      await this.prisma.$transaction(async (tx) => {
        const organizationId = process.env.DEFAULT_ORGANIZATION_ID ?? 'org-pathway';
        const organization = await tx.organization.findUnique({ where: { id: organizationId } });
        if (!organization)
          throw new BadRequestException(
            'Registration is not configured. Contact the education provider.',
          );
        const user = await tx.user.create({
          data: {
            email,
            name: input.name.trim(),
            passwordHash,
            memberships: { create: { organizationId, roles: { create: { role: 'LEARNER' } } } },
          },
        });
        await this.issueContact(tx, user.id, email, 'VERIFY');
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'))
        throw error;
    }
    return neutralMessage;
  }
  async login(input: LoginDto) {
    if (input.totp && input.recoveryCode)
      throw new BadRequestException('Enter an authenticator code or a recovery code.');
    const user = await this.prisma.user.findUnique({
      where: { email: input.email.trim().toLowerCase() },
      include: {
        memberships: {
          where: { state: 'ACTIVE' },
          include: { roles: true },
          orderBy: { id: 'asc' },
        },
      },
    });
    const valid = user
      ? await argon2.verify(user.passwordHash, input.password)
      : (await argon2.hash(input.password, {
          type: argon2.argon2id,
          memoryCost: 65536,
          timeCost: 3,
          parallelism: 1,
        }),
        false);
    if (!user || !valid)
      throw new UnauthorizedException({
        code: 'CREDENTIALS_INVALID',
        message: 'Email or password was not recognized.',
      });
    const membership = user.memberships[0];
    if (!membership)
      throw new ForbiddenException({
        code: 'MEMBERSHIP_INACTIVE',
        message: 'Your membership is not active. Contact support.',
      });
    let mfaVerified = false;
    let mfaStep: bigint | undefined;
    if (user.mfaSecret) {
      if (input.recoveryCode) {
        // The single-use claim occurs while holding the user row lock below.
        mfaVerified = true;
      } else if (!input.totp || !authenticator.check(input.totp, openSecret(user.mfaSecret)))
        throw new UnauthorizedException({
          code: 'MFA_CODE_REQUIRED',
          message: 'Enter an authenticator code or one of your saved recovery codes.',
        });
      else {
        mfaVerified = true;
        mfaStep = BigInt(Math.floor(Date.now() / 30000));
      }
    }
    const roles = membership.roles.map((item) => item.role);
    const rawToken = token();
    const csrfToken = token();
    const expiresAt = new Date(
      Date.now() +
        Math.min(Number(process.env.SESSION_TTL_HOURS ?? 24), privileged(roles) ? 12 : 168) *
          3600 *
          1000,
    );
    await this.prisma.$transaction(async (tx) => {
      // Password reset updates this same row before revoking sessions. Lock and
      // recheck after hashing to prevent a concurrent old-password login from
      // issuing a fresh session after recovery has already revoked the old ones.
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${user.id} FOR UPDATE`;
      const current = await tx.user.findUnique({
        where: { id: user.id },
        select: { passwordHash: true, mfaSecret: true },
      });
      if (
        !current ||
        current.passwordHash !== user.passwordHash ||
        current.mfaSecret !== user.mfaSecret
      )
        throw new UnauthorizedException({
          code: 'CREDENTIALS_CHANGED',
          message: 'Your sign-in details changed. Sign in again.',
        });
      if (mfaStep !== undefined) {
        const used = await tx.user.updateMany({
          where: {
            id: user.id,
            mfaSecret: user.mfaSecret,
            OR: [{ mfaLastUsedStep: null }, { mfaLastUsedStep: { lt: mfaStep } }],
          },
          data: { mfaLastUsedStep: mfaStep },
        });
        if (used.count !== 1)
          throw new UnauthorizedException({
            code: 'MFA_CODE_REUSED',
            message: 'Wait for a new authenticator code and try again.',
          });
      }
      if (input.recoveryCode && user.mfaSecret) {
        const used = await tx.mfaRecoveryCode.updateMany({
          where: {
            userId: user.id,
            codeHash: tokenHash(input.recoveryCode.replace(/-/g, '').toLowerCase()),
            usedAt: null,
          },
          data: { usedAt: new Date() },
        });
        if (used.count !== 1)
          throw new UnauthorizedException({
            code: 'MFA_RECOVERY_INVALID',
            message: 'This recovery code was not recognized or has already been used.',
          });
        const recoveryEvent = await tx.auditEvent.create({
          data: {
            actorId: user.id,
            organizationId: membership.organizationId,
            action: 'auth.mfa.recovery-used',
            objectId: user.id,
          },
        });
        await tx.notification.create({
          data: {
            userId: user.id,
            organizationId: membership.organizationId,
            eventId: recoveryEvent.id,
            title: 'A recovery code was used to sign in',
            body: 'If you did not sign in, reset your password, revoke your sessions, and contact support.',
          },
        });
      }
      await tx.session.create({
        data: {
          tokenHash: tokenHash(rawToken),
          csrfToken,
          userId: user.id,
          membershipId: membership.id,
          mfaVerified,
          expiresAt,
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId: user.id,
          organizationId: membership.organizationId,
          action: 'auth.login',
          objectId: user.id,
        },
      });
    });
    return {
      rawToken,
      expiresAt,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        organizationId: membership.organizationId,
        membershipId: membership.id,
        roles,
        verified: !!user.verifiedAt,
        mfaEnabled: !!user.mfaSecret,
        timezone: user.timezone,
        locale: user.locale,
      },
      csrfToken,
      mfaRequired: privileged(roles) && !mfaVerified,
    };
  }
  async recover(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    if (user)
      await this.prisma.$transaction((tx) => this.issueContact(tx, user.id, user.email, 'RECOVER'));
    return neutralMessage;
  }
  async resendVerification(user: AuthUser) {
    if (!user.verified)
      await this.prisma.$transaction((tx) => this.issueContact(tx, user.id, user.email, 'VERIFY'));
    return neutralMessage;
  }
  async verify(rawToken: string) {
    return this.prisma.$transaction(async (tx) => {
      const contact = await tx.contactToken.findUnique({
        where: { tokenHash: tokenHash(rawToken) },
      });
      if (
        !contact ||
        contact.kind !== 'VERIFY' ||
        contact.usedAt ||
        contact.expiresAt.getTime() <= Date.now()
      )
        throw new BadRequestException({
          code: 'TOKEN_INVALID',
          message: 'This link has expired or has already been used.',
        });
      // Account link issuance, verification, recovery and sign-in acquire the
      // user row first, preventing lock-order deadlocks during concurrent resends.
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${contact.userId} FOR UPDATE`;
      const claimed = await tx.contactToken.updateMany({
        where: { id: contact.id, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });
      if (claimed.count !== 1) throw new BadRequestException('This link has already been used.');
      await tx.user.update({ where: { id: contact.userId }, data: { verifiedAt: new Date() } });
      return { message: 'Your email is verified. You can sign in and start learning.' };
    });
  }
  async reset(input: ResetDto) {
    const passwordHash = await argon2.hash(input.password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 1,
    });
    return this.prisma.$transaction(async (tx) => {
      const contact = await tx.contactToken.findUnique({
        where: { tokenHash: tokenHash(input.token) },
      });
      if (
        !contact ||
        contact.kind !== 'RECOVER' ||
        contact.usedAt ||
        contact.expiresAt.getTime() <= Date.now()
      )
        throw new BadRequestException({
          code: 'TOKEN_INVALID',
          message: 'This link has expired or has already been used.',
        });
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${contact.userId} FOR UPDATE`;
      const claimed = await tx.contactToken.updateMany({
        where: { id: contact.id, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });
      if (claimed.count !== 1) throw new BadRequestException('This link has already been used.');
      await tx.user.update({
        where: { id: contact.userId },
        data: { passwordHash, verifiedAt: new Date() },
      });
      await tx.session.updateMany({
        where: { userId: contact.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.contactToken.updateMany({
        where: { userId: contact.userId, usedAt: null },
        data: { usedAt: new Date() },
      });
      return { message: 'Password updated. Sign in with your new password.' };
    });
  }
  async setupMfa(user: AuthUser) {
    if (user.mfaEnabled) throw new BadRequestException('Two-step sign-in is already enabled.');
    const secret = authenticator.generateSecret();
    const changed = await this.prisma.user.updateMany({
      where: { id: user.id, mfaSecret: null },
      data: { mfaPendingSecret: sealSecret(secret) },
    });
    if (changed.count !== 1) throw new BadRequestException('Two-step sign-in is already enabled.');
    return { secret, uri: authenticator.keyuri(user.email, 'Pathway', secret) };
  }
  async enableMfa(user: AuthUser, sessionId: string, code: string) {
    const record = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    if (
      !record.mfaPendingSecret ||
      record.mfaSecret ||
      !authenticator.check(code, openSecret(record.mfaPendingSecret))
    )
      throw new BadRequestException({
        code: 'MFA_INVALID',
        message: 'Enter a current code from the authenticator you just set up.',
      });
    await this.prisma.$transaction(async (tx) => {
      const changed = await tx.user.updateMany({
        where: { id: user.id, mfaSecret: null, mfaPendingSecret: record.mfaPendingSecret },
        data: {
          mfaSecret: record.mfaPendingSecret,
          mfaPendingSecret: null,
          mfaLastUsedStep: BigInt(Math.floor(Date.now() / 30000)),
        },
      });
      if (changed.count !== 1)
        throw new BadRequestException('Two-step setup changed. Start again.');
      const session = await tx.session.updateMany({
        where: { id: sessionId, userId: user.id, revokedAt: null, expiresAt: { gt: new Date() } },
        data: { mfaVerified: true },
      });
      if (session.count !== 1)
        throw new UnauthorizedException('Sign in again to finish two-step setup.');
      await tx.session.updateMany({
        where: { userId: user.id, id: { not: sessionId }, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.auditEvent.create({
        data: {
          actorId: user.id,
          organizationId: user.organizationId,
          action: 'auth.mfa.enabled',
          objectId: user.id,
        },
      });
    });
    return {
      message:
        'Two-step sign-in is enabled. Keep your authenticator app available when signing in.',
    };
  }
  async revoke(userId: string, sessionId?: string) {
    await this.prisma.session.updateMany({
      where: { userId, ...(sessionId ? { id: sessionId } : {}), revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { message: sessionId ? 'Signed out.' : 'All sessions revoked.' };
  }
  async generateRecoveryCodes(
    user: AuthUser,
    sessionId: string,
    mfaVerified: boolean,
    password: string,
  ) {
    if (!user.mfaEnabled || !mfaVerified)
      throw new ForbiddenException('Verify two-step sign-in before generating recovery codes.');
    const record = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    if (!(await argon2.verify(record.passwordHash, password)))
      throw new UnauthorizedException('Your password was not recognized.');
    // Each code has 128 bits of cryptographic randomness. Only SHA-256 digests
    // persist; high-entropy saved secrets do not require password stretching.
    const codes = Array.from({ length: 10 }, () =>
      randomBytes(16).toString('hex').match(/.{4}/g)!.join('-'),
    );
    const generatedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${user.id} FOR UPDATE`;
      const current = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
      const activeSession = await tx.session.findFirst({
        where: {
          id: sessionId,
          userId: user.id,
          mfaVerified: true,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        select: { id: true },
      });
      if (!activeSession || !current.mfaSecret || current.passwordHash !== record.passwordHash)
        throw new UnauthorizedException('Your security settings changed. Sign in again.');
      await tx.mfaRecoveryCode.deleteMany({ where: { userId: user.id } });
      await tx.mfaRecoveryCode.createMany({
        data: codes.map((code) => ({
          userId: user.id,
          codeHash: tokenHash(code.replace(/-/g, '')),
          createdAt: generatedAt,
        })),
      });
      await tx.auditEvent.create({
        data: {
          actorId: user.id,
          organizationId: user.organizationId,
          action: 'auth.mfa.recovery-generated',
          objectId: user.id,
        },
      });
    });
    return { codes, generatedAt: generatedAt.toISOString() };
  }
}
