import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import Redis from 'ioredis';
import { PrismaService } from '../database/prisma.service';
import { scannerReady } from '../media/scanner';
import { storageReady } from '../media/storage';
import { redisOptions, WORKER_HEARTBEAT } from '../jobs/queue';
import { smtpTransport } from '../jobs/outbox';

@Injectable()
export class HealthService {
  constructor(private readonly db: PrismaService) {}

  async ready() {
    const redis = new Redis({
      ...redisOptions(),
      lazyConnect: true,
      maxRetriesPerRequest: 0,
      connectTimeout: 1500,
      commandTimeout: 1500,
      retryStrategy: () => null,
    });
    redis.on('error', () => {
      /* readiness returns a bounded dependency status */
    });
    const mail = smtpTransport();
    const checks = {
      database: this.db.$queryRaw`SELECT 1`,
      redis: redis.ping(),
      storage: storageReady(),
      scanner: scannerReady(),
      email: mail.verify(),
      worker: redis.get(WORKER_HEARTBEAT).then((value) => {
        if (!value) throw new Error('Worker heartbeat expired');
      }),
    };
    try {
      const results = await Promise.allSettled(Object.values(checks));
      const dependencies = Object.fromEntries(
        Object.keys(checks).map((name, index) => [name, results[index].status === 'fulfilled']),
      );
      if (Object.values(dependencies).some((value) => !value))
        throw new ServiceUnavailableException({
          code: 'DEPENDENCY_UNAVAILABLE',
          message: 'One or more required services are unavailable.',
          status: 'degraded',
          dependencies,
        });
      return { status: 'ready', dependencies };
    } finally {
      redis.disconnect();
      mail.close();
    }
  }
}
