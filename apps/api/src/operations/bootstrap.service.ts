import { Prisma, PrismaClient, Role } from '@prisma/client';
import * as argon2 from 'argon2';
import { token, tokenHash } from '../auth/auth.crypto';
import type { BootstrapInput } from './bootstrap.config';

export class BootstrapConflict extends Error {
  constructor() {
    super(
      'Bootstrap refused: the organization or account already exists. No existing records were changed.',
    );
  }
}

/** Operator-only provisioning; no HTTP route and no existing-record updates. */
export async function bootstrapOrganization(db: PrismaClient, input: BootstrapInput) {
  const passwordHash = await argon2.hash(input.password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });
  const roles: Role[] = input.academicAccess ? ['ADMIN', 'ACADEMIC_ADMIN'] : ['ADMIN'];
  try {
    return await db.$transaction(async (tx) => {
      const organization = await tx.organization.findUnique({
        where: { id: input.organizationId },
        select: { id: true },
      });
      const existingUser = await tx.user.findUnique({
        where: { email: input.email },
        select: { id: true },
      });
      if (organization || existingUser) throw new BootstrapConflict();
      await tx.organization.create({
        data: { id: input.organizationId, name: input.organizationName },
      });
      const user = await tx.user.create({
        data: {
          email: input.email,
          name: input.name,
          passwordHash,
          memberships: {
            create: {
              organizationId: input.organizationId,
              roles: { create: roles.map((role) => ({ role })) },
            },
          },
        },
        select: { id: true },
      });
      // Provisioning does not bypass contact verification or first-login MFA.
      const raw = token();
      const url = new URL('/verify', process.env.WEB_ORIGIN ?? 'http://localhost:3000');
      url.searchParams.set('token', raw);
      await tx.contactToken.create({
        data: {
          userId: user.id,
          kind: 'VERIFY',
          tokenHash: tokenHash(raw),
          expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
        },
      });
      await tx.outboxEvent.create({
        data: {
          type: 'EMAIL',
          payload: {
            organizationId: input.organizationId,
            to: input.email,
            subject: 'Verify your Pathway email',
            text: `Open this link to verify your email: ${url.toString()}\nIf you did not request this, contact your education provider.`,
          },
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId: user.id,
          organizationId: input.organizationId,
          action: 'organization.bootstrapped',
          objectId: input.organizationId,
          detail: { roles, operatorProvisioned: true },
        },
      });
      return { organizationId: input.organizationId, userId: user.id };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
      throw new BootstrapConflict();
    throw error;
  }
}
