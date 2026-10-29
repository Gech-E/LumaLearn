import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AuthUser } from '../auth/auth.decorators';
import { PageDto, ProfileDto } from './users.dto';
const profileSelect = {
  id: true,
  email: true,
  name: true,
  timezone: true,
  locale: true,
  reminders: true,
  quietStart: true,
  quietEnd: true,
  verifiedAt: true,
} as const;
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}
  async me(user: AuthUser) {
    const profile = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: profileSelect,
    });
    return {
      ...profile,
      roles: user.roles,
      organizationId: user.organizationId,
      membershipId: user.membershipId,
      mfaEnabled: user.mfaEnabled,
    };
  }
  async update(user: AuthUser, data: ProfileDto) {
    if (data.timezone) {
      try {
        new Intl.DateTimeFormat('en', { timeZone: data.timezone }).format();
      } catch {
        throw new BadRequestException('Choose a valid IANA timezone, such as Africa/Nairobi.');
      }
    }
    await this.prisma.user.update({ where: { id: user.id }, data });
    return this.me(user);
  }
  async list(user: AuthUser, query: PageDto) {
    if (!user.roles.includes('ADMIN'))
      throw new ForbiddenException('Organization administration permission is required.');
    const where = {
      memberships: { some: { organizationId: user.organizationId } },
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: 'insensitive' as const } },
              { email: { contains: query.q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          verifiedAt: true,
          memberships: {
            where: { organizationId: user.organizationId },
            select: { id: true, state: true, roles: { select: { role: true } } },
          },
        },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { name: 'asc' },
      }),
      this.prisma.user.count({ where }),
    ]);
    return {
      items: items.map((item) => ({
        id: item.id,
        name: item.name,
        email: item.email,
        verified: !!item.verifiedAt,
        membershipId: item.memberships[0]?.id,
        state: item.memberships[0]?.state,
        roles: item.memberships[0]?.roles.map((role) => role.role) ?? [],
      })),
      total,
      page: query.page,
      limit: query.limit,
    };
  }
}
