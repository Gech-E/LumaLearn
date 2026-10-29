import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../database/prisma.service';
import { ALLOW_SETUP, AuthRequest, IS_PUBLIC, REQUIRED_ROLES } from './auth.decorators';
import { constantEqual, tokenHash } from './auth.crypto';

export const privileged = (roles: string[]) => roles.some((role) => role !== 'LEARNER');
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<AuthRequest>();
    const targets = [context.getHandler(), context.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets);
    const write = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
    const origins = (process.env.WEB_ORIGIN ?? 'http://localhost:3000')
      .split(',')
      .map((value) => value.trim());
    if (
      write &&
      ((req.headers.origin && !origins.includes(req.headers.origin)) ||
        (!req.headers.origin && req.headers['sec-fetch-site'] === 'cross-site'))
    ) {
      throw new ForbiddenException({
        code: 'ORIGIN_DENIED',
        message: 'This request came from an untrusted site.',
      });
    }
    // Public endpoints never derive identity from an optional cookie. Recovery remains
    // available when a suspended membership or stale session is still in the browser.
    if (isPublic) return true;
    const cookieName =
      process.env.NODE_ENV === 'production' ? '__Host-pathway_session' : 'pathway_session';
    const raw = (req.cookies as Record<string, string> | undefined)?.[cookieName];
    if (!raw || typeof raw !== 'string' || raw.length > 200)
      throw new UnauthorizedException({
        code: 'SESSION_REQUIRED',
        message: 'Please sign in to continue.',
      });
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: tokenHash(raw) },
      include: { user: true, membership: { include: { roles: true } } },
    });
    if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException({
        code: 'SESSION_EXPIRED',
        message: 'Your session has expired. Please sign in again.',
      });
    }
    if (session.membership.state !== 'ACTIVE' || session.membership.userId !== session.userId)
      throw new ForbiddenException({
        code: 'MEMBERSHIP_INACTIVE',
        message: 'Your membership is not active. Contact support for help.',
      });
    const roles = session.membership.roles.map((assignment) => assignment.role);
    req.user = {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      organizationId: session.membership.organizationId,
      membershipId: session.membershipId,
      roles,
      verified: !!session.user.verifiedAt,
      mfaEnabled: !!session.user.mfaSecret,
      timezone: session.user.timezone,
      locale: session.user.locale,
    };
    req.sessionId = session.id;
    req.csrfToken = session.csrfToken;
    req.mfaVerified = session.mfaVerified;
    if (write && !constantEqual(String(req.headers['x-csrf-token'] ?? ''), session.csrfToken))
      throw new ForbiddenException({
        code: 'CSRF_INVALID',
        message: 'Refresh this page and try again.',
      });
    if (!this.reflector.getAllAndOverride<boolean>(ALLOW_SETUP, targets)) {
      if (!session.user.verifiedAt)
        throw new ForbiddenException({
          code: 'CONTACT_UNVERIFIED',
          message: 'Verify your email before continuing.',
        });
      if (
        (privileged(roles) || session.user.mfaSecret) &&
        (!session.user.mfaSecret || !session.mfaVerified)
      )
        throw new ForbiddenException({
          code: 'MFA_REQUIRED',
          message: 'Set up or verify two-step sign-in to use this account.',
        });
    }
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(REQUIRED_ROLES, targets);
    if (requiredRoles && !requiredRoles.some((role) => roles.includes(role as never)))
      throw new ForbiddenException({
        code: 'ROLE_REQUIRED',
        message: 'You do not have permission for this action.',
      });
    return true;
  }
}
