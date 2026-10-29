import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AuthUser } from '../auth/auth.decorators';
import { PageDto } from '../users/users.dto';
import { NoticeDto } from './notifications.dto';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}
  async list(user: AuthUser, query: PageDto) {
    const where = { userId: user.id, organizationId: user.organizationId };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        select: { id: true, title: true, body: true, readAt: true, createdAt: true },
        take: query.limit,
        skip: (query.page - 1) * query.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.notification.count({ where }),
    ]);
    return { items, total, page: query.page, limit: query.limit };
  }
  async read(user: AuthUser, id: string) {
    const changed = await this.prisma.notification.updateMany({
      where: { id, userId: user.id, organizationId: user.organizationId },
      data: { readAt: new Date() },
    });
    if (changed.count !== 1) throw new NotFoundException('Notification not found.');
    return { id, read: true };
  }
  async notice(user: AuthUser, input: NoticeDto) {
    if (!user.roles.includes('ADMIN')) throw new ForbiddenException();
    return this.prisma.$transaction(async (tx) => {
      const event = await tx.outboxEvent.create({
        data: {
          type: 'SERVICE_NOTICE',
          payload: { organizationId: user.organizationId, title: input.title, body: input.body },
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId: user.id,
          organizationId: user.organizationId,
          action: 'notice.created',
          objectId: event.id,
        },
      });
      return { id: event.id, status: 'PENDING' };
    });
  }
}
