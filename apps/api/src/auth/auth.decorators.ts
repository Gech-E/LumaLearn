import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';

export const IS_PUBLIC = 'pathway.public';
export const ALLOW_SETUP = 'pathway.allowSetup';
export const REQUIRED_ROLES = 'pathway.roles';
export const Public = () => SetMetadata(IS_PUBLIC, true);
export const AllowSetup = () => SetMetadata(ALLOW_SETUP, true);
export const Roles = (...roles: string[]) => SetMetadata(REQUIRED_ROLES, roles);
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  organizationId: string;
  membershipId: string;
  roles: string[];
  verified: boolean;
  mfaEnabled: boolean;
  timezone: string;
  locale: string;
}
export interface AuthRequest extends Request {
  user: AuthUser;
  sessionId: string;
  csrfToken: string;
  mfaVerified: boolean;
}
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser =>
    ctx.switchToHttp().getRequest<AuthRequest>().user,
);
