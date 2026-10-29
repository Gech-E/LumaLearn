import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { applyValidatedEnvironment } from '../config/environment';
import { readBootstrapEnvironment } from './bootstrap.config';
import { bootstrapOrganization, BootstrapConflict } from './bootstrap.service';

async function main() {
  config({ quiet: true });
  // Consume BOOTSTRAP_PASSWORD before any possible validation/connection error.
  const input = readBootstrapEnvironment(process.env);
  let db: PrismaClient | undefined;
  try {
    applyValidatedEnvironment();
    db = new PrismaClient();
    await bootstrapOrganization(db, input);
    console.log(
      'New organization and administrator created. Email verification delivery is queued. Verify the email and complete MFA setup before administering the organization.',
    );
  } catch (error) {
    if (error instanceof BootstrapConflict) throw error;
    throw new Error(
      'Bootstrap failed. Check the deployment configuration, database connectivity and migrations. No credentials were logged.',
    );
  } finally {
    input.password = '';
    await db?.$disconnect();
  }
}

if (require.main === module)
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Bootstrap failed.');
    process.exitCode = 1;
  });
