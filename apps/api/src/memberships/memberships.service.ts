import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AuthUser } from '../auth/auth.decorators';
import { MembershipUpdateDto } from './memberships.dto';
import { PageDto } from '../users/users.dto';
export function checkRoleAssignment(actor: AuthUser, targetUserId: string, nextRoles?: string[]) {
  if (!actor.roles.includes('ADMIN'))
    throw new ForbiddenException('Organization administration permission is required.');
  if (actor.id === targetUserId)
    throw new ForbiddenException('Ask another administrator to change your own membership.');
  if (nextRoles?.includes('ACADEMIC_ADMIN') && !actor.roles.includes('ACADEMIC_ADMIN'))
    throw new ForbiddenException('You cannot grant academic record access that you do not hold.');
}
@Injectable()
export class MembershipsService {
  constructor(private readonly prisma: PrismaService) {}
  async list(user: AuthUser, query: PageDto) {
    if (!user.roles.includes('ADMIN')) throw new ForbiddenException();
    const where = { organizationId: user.organizationId };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.membership.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, email: true } },
          roles: { select: { role: true } },
        },
        take: query.limit,
        skip: (query.page - 1) * query.limit,
        orderBy: { id: 'asc' },
      }),
      this.prisma.membership.count({ where }),
    ]);
    return {
      items: items.map((item) => ({
        id: item.id,
        userId: item.userId,
        state: item.state,
        user: item.user,
        roles: item.roles.map((role) => role.role),
      })),
      total,
      page: query.page,
      limit: query.limit,
    };
  }
  async update(user: AuthUser, id: string, input: MembershipUpdateDto) {
    if (!input.roles && !input.state)
      throw new BadRequestException('Choose a membership state or roles to update.');
    return this.prisma.$transaction(async (tx) => {
      const membership = await tx.membership.findFirst({
        where: { id, organizationId: user.organizationId },
        include: { roles: true },
      });
      if (!membership) throw new NotFoundException('Membership not found.');
      checkRoleAssignment(user, membership.userId, input.roles);
      if (
        membership.roles.some((role) => role.role === 'ACADEMIC_ADMIN') &&
        !user.roles.includes('ACADEMIC_ADMIN')
      )
        throw new ForbiddenException(
          'An administrator with academic permission must manage this membership.',
        );
      await tx.membership.update({
        where: { id },
        data: {
          state: input.state,
          ...(input.roles
            ? { roles: { deleteMany: {}, create: input.roles.map((role) => ({ role })) } }
            : {}),
        },
      });
      await tx.session.updateMany({
        where: { membershipId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.auditEvent.create({
        data: {
          actorId: user.id,
          organizationId: user.organizationId,
          action: 'membership.updated',
          objectId: id,
          detail: {
            previousState: membership.state,
            state: input.state ?? membership.state,
            previousRoles: membership.roles.map((role) => role.role),
            roles: input.roles ?? membership.roles.map((role) => role.role),
          },
        },
      });
      return {
        id,
        state: input.state ?? membership.state,
        roles: input.roles ?? membership.roles.map((role) => role.role),
        message: 'Membership updated. Existing sessions were revoked.',
      };
    });
  }
}
