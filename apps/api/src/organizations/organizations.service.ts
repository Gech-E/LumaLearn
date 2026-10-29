import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AuthUser } from '../auth/auth.decorators';

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}
  get(user: AuthUser) {
    return this.prisma.organization.findUniqueOrThrow({
      where: { id: user.organizationId },
      select: { id: true, name: true },
    });
  }
  async update(user: AuthUser, name: string) {
    if (!user.roles.includes('ADMIN')) throw new ForbiddenException();
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.organization.update({
        where: { id: user.organizationId },
        data: { name },
        select: { id: true, name: true },
      });
      await tx.auditEvent.create({
        data: {
          actorId: user.id,
          organizationId: user.organizationId,
          action: 'organization.updated',
          objectId: user.organizationId,
        },
      });
      return result;
    });
  }
}
