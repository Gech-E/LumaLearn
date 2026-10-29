import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AuthUser } from '../auth/auth.decorators';
import { PageDto } from '../users/users.dto';
import { createOutboxQueue } from './queue';

@Injectable()
export class JobsService {
  constructor(private readonly db: PrismaService) {}
  async list(user: AuthUser, page: PageDto) {
    if (!user.roles.includes('ADMIN')) throw new ForbiddenException();
    const where = { payload: { path: ['organizationId'], equals: user.organizationId } };
    const [items, total] = await this.db.$transaction([
      this.db.outboxEvent.findMany({
        where,
        select: {
          id: true,
          type: true,
          status: true,
          attempts: true,
          lastError: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: page.limit,
        skip: (page.page - 1) * page.limit,
      }),
      this.db.outboxEvent.count({ where }),
    ]);
    return { items, total, page: page.page, limit: page.limit };
  }
  async retry(user: AuthUser, id: string) {
    if (!user.roles.includes('ADMIN')) throw new ForbiddenException();
    const event = await this.db.outboxEvent.findFirst({
      where: {
        id,
        status: 'FAILED',
        payload: { path: ['organizationId'], equals: user.organizationId },
      },
    });
    if (!event) throw new NotFoundException('Failed job not found.');
    const queue = createOutboxQueue();
    try {
      const job = await queue.getJob(id);
      if (job && (await job.getState()) !== 'failed')
        throw new ServiceUnavailableException(
          'This job is still active. Try again after it settles.',
        );
      // Remove the failed Redis record first. A crash before the DB reset remains safely FAILED.
      if (job) await job.remove();
      return await this.db.$transaction(async (tx) => {
        const changed = await tx.outboxEvent.updateMany({
          where: { id, status: 'FAILED' },
          data: { status: 'PENDING', attempts: 0, lastError: null },
        });
        if (!changed.count) throw new NotFoundException('This job has already been replayed.');
        await tx.auditEvent.create({
          data: {
            actorId: user.id,
            organizationId: user.organizationId,
            action: 'job.replayed',
            objectId: id,
          },
        });
        return { id, status: 'PENDING' };
      });
    } finally {
      await queue.close();
    }
  }
}
