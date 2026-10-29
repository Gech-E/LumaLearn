import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnvironment } from './config/environment';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { MembershipsModule } from './memberships/memberships.module';
import { MediaModule } from './media/media.module';
import { NotificationsModule } from './notifications/notifications.module';
import { SupportModule } from './support/support.module';
import { AuditModule } from './audit/audit.module';
import { HealthModule } from './health/health.module';
import { JobsModule } from './jobs/jobs.module';
import { learningModules } from './learning-modules';
import { PrivacyModule } from './privacy/privacy.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', 'apps/api/.env'],
      validate: validateEnvironment,
    }),
    DatabaseModule,
    AuthModule,
    UsersModule,
    PrivacyModule,
    OrganizationsModule,
    MembershipsModule,
    ...learningModules,
    MediaModule,
    NotificationsModule,
    SupportModule,
    AuditModule,
    HealthModule,
    JobsModule,
  ],
})
export class AppModule {}
