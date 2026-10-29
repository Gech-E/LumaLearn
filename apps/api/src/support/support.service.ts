import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AuthUser } from '../auth/auth.decorators';
import { PageDto } from '../users/users.dto';
import { CreateSupportDto, RespondSupportDto } from './support.dto';

const ticketFields = {
  id: true,
  userId: true,
  kind: true,
  activityId: true,
  subject: true,
  message: true,
  status: true,
  response: true,
  createdAt: true,
} as const;
const canSupport = (user: AuthUser) =>
  user.roles.includes('SUPPORT') || user.roles.includes('ADMIN');
@Injectable()
export class SupportService {
  constructor(private readonly prisma: PrismaService) {}
  async list(user: AuthUser, query: PageDto) {
    const broad = canSupport(user);
    const where = { organizationId: user.organizationId, ...(!broad ? { userId: user.id } : {}) };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.supportRequest.findMany({
        where,
        select: ticketFields,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.supportRequest.count({ where }),
    ]);
    if (broad)
      await this.prisma.auditEvent.create({
        data: {
          actorId: user.id,
          organizationId: user.organizationId,
          action: 'support.list',
          objectId: user.organizationId,
          detail: { page: query.page },
        },
      });
    return { items, total, page: query.page, limit: query.limit };
  }
  async create(user: AuthUser, input: CreateSupportDto) {
    if (input.activityId) {
      const activity = await this.prisma.activityVersion.findFirst({
        where: {
          id: input.activityId,
          module: {
            courseVersion: {
              course: { organizationId: user.organizationId },
              enrollments: { some: { userId: user.id, state: 'ACTIVE' } },
            },
          },
        },
        select: { id: true },
      });
      if (!activity) throw new NotFoundException('Activity not found for your enrollment.');
    }
    return this.prisma.$transaction(async (tx) => {
      const request = await tx.supportRequest.create({
        data: { ...input, organizationId: user.organizationId, userId: user.id },
        select: ticketFields,
      });
      await tx.auditEvent.create({
        data: {
          actorId: user.id,
          organizationId: user.organizationId,
          action: request.kind === 'HELP' ? 'support.created' : 'privacy.requested',
          objectId: request.id,
          detail: { kind: request.kind },
        },
      });
      return request;
    });
  }
  async respond(user: AuthUser, id: string, input: RespondSupportDto) {
    if (!canSupport(user)) throw new ForbiddenException('Support access is required.');
    return this.prisma.$transaction(async (tx) => {
      const ticket = await tx.supportRequest.findFirst({
        where: { id, organizationId: user.organizationId },
      });
      if (!ticket) throw new NotFoundException('Help request not found.');
      const result = await tx.supportRequest.update({
        where: { id },
        data: input,
        select: ticketFields,
      });
      const event = await tx.auditEvent.create({
        data: {
          actorId: user.id,
          organizationId: user.organizationId,
          action: 'support.responded',
          objectId: id,
          detail: { previousStatus: ticket.status, status: input.status, kind: ticket.kind },
        },
      });
      await tx.notification.create({
        data: {
          userId: ticket.userId,
          organizationId: user.organizationId,
          eventId: event.id,
          title: `${ticket.kind === 'HELP' ? 'Help' : 'Privacy'} request: ${ticket.subject}`,
          body: input.response,
        },
      });
      return result;
    });
  }
}
