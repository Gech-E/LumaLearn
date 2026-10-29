import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AuthUser } from '../auth/auth.decorators';
import { PageDto } from '../users/users.dto';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}
  async list(user: AuthUser, query: PageDto) {
    if (!user.roles.includes('ADMIN')) throw new ForbiddenException();
    const where = { organizationId: user.organizationId };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditEvent.findMany({
        where,
        select: { id: true, actorId: true, action: true, objectId: true, createdAt: true },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.auditEvent.count({ where }),
    ]);
    return { items, total, page: query.page, limit: query.limit };
  }
}
