import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AuthUser } from '../auth/auth.decorators';
import { PrismaService } from '../database/prisma.service';
import { deleteObject, downloadUrl, MAX_FILE_BYTES, storeObject } from './storage';

const metadata = {
  id: true,
  name: true,
  mime: true,
  size: true,
  status: true,
  createdAt: true,
} as const;
export function validFileType(bytes: Buffer, mime: string) {
  if (mime === 'application/pdf') return bytes.subarray(0, 5).toString() === '%PDF-';
  if (mime === 'image/png')
    return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mime === 'image/jpeg') return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (['text/plain', 'text/csv'].includes(mime)) {
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      return !bytes.includes(0);
    } catch {
      return false;
    }
  }
  return false;
}
@Injectable()
export class MediaService {
  constructor(private readonly prisma: PrismaService) {}
  async upload(user: AuthUser, file?: Express.Multer.File) {
    if (
      !file ||
      !file.buffer ||
      !file.size ||
      file.size !== file.buffer.length ||
      file.size > MAX_FILE_BYTES
    )
      throw new BadRequestException('Choose a file up to 10 MB.');
    if (!validFileType(file.buffer, file.mimetype))
      throw new BadRequestException('Choose a valid PDF, PNG, JPEG, UTF-8 text or CSV file.');
    const id = randomUUID();
    const key = `${user.organizationId}/${user.id}/${id}`;
    const name = file.originalname.replace(/[\p{Cc}/\\]/gu, '_').slice(0, 160) || 'attachment';
    await storeObject(key, file.buffer, file.mimetype);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const asset = await tx.asset.create({
          data: {
            id,
            key,
            name,
            organizationId: user.organizationId,
            userId: user.id,
            mime: file.mimetype,
            size: file.size,
            status: 'QUARANTINED',
          },
          select: metadata,
        });
        await tx.outboxEvent.create({
          data: {
            type: 'SCAN_FILE',
            payload: { assetId: id, organizationId: user.organizationId },
          },
        });
        return asset;
      });
    } catch (error) {
      // Private orphan objects are inaccessible, but clean them up when the handoff cannot commit.
      await deleteObject(key).catch(() => undefined);
      throw error;
    }
  }
  private async authorized(user: AuthUser, id: string) {
    const asset = await this.prisma.asset.findFirst({
      where: { id, organizationId: user.organizationId },
    });
    if (!asset) throw new NotFoundException('File not found.');
    if (asset.userId !== user.id) {
      const elevated = user.roles.includes('ACADEMIC_ADMIN');
      if (!elevated && !user.roles.includes('INSTRUCTOR'))
        throw new NotFoundException('File not found.');
      const submission = await this.prisma.submission.findFirst({
        where: {
          assetIds: { has: id },
          state: { in: ['SUBMITTED', 'REVISION_REQUESTED'] },
          enrollment: {
            course: {
              organizationId: user.organizationId,
              ...(!elevated ? { assignments: { some: { userId: user.id } } } : {}),
            },
          },
        },
        select: { id: true },
      });
      if (!submission) throw new NotFoundException('File not found.');
      await this.prisma.auditEvent.create({
        data: {
          actorId: user.id,
          organizationId: user.organizationId,
          action: 'media.read',
          objectId: id,
        },
      });
    }
    return asset;
  }
  async status(user: AuthUser, id: string) {
    const asset = await this.authorized(user, id);
    return {
      id: asset.id,
      name: asset.name,
      mime: asset.mime,
      size: asset.size,
      status: asset.status,
      createdAt: asset.createdAt,
    };
  }
  async download(user: AuthUser, id: string) {
    const asset = await this.authorized(user, id);
    if (asset.status !== 'CLEAN')
      throw new BadRequestException({
        code: 'FILE_NOT_READY',
        message:
          asset.status === 'REJECTED'
            ? 'This file did not pass the required checks.'
            : 'This file is waiting for its security check.',
      });
    return { url: await downloadUrl(asset.key, asset.name), expiresIn: 60, name: asset.name };
  }
}
