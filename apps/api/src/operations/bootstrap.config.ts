import { z } from 'zod';

const BootstrapEnvironment = z.object({
  BOOTSTRAP_EMAIL: z.string().trim().toLowerCase().email().max(254),
  BOOTSTRAP_NAME: z.string().trim().min(2).max(120),
  BOOTSTRAP_ORGANIZATION_ID: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9][a-z0-9_-]*$/),
  BOOTSTRAP_ORGANIZATION_NAME: z.string().trim().min(2).max(160),
  BOOTSTRAP_PASSWORD: z.string().min(16).max(128),
  BOOTSTRAP_ACADEMIC_ACCESS: z.enum(['true', 'false']).default('false'),
});

export type BootstrapInput = {
  email: string;
  name: string;
  organizationId: string;
  organizationName: string;
  password: string;
  academicAccess: boolean;
};

/** Consume the secret even when validation fails. Never include input values in errors. */
export function readBootstrapEnvironment(
  environment: Record<string, string | undefined>,
): BootstrapInput {
  const password = environment.BOOTSTRAP_PASSWORD;
  delete environment.BOOTSTRAP_PASSWORD;
  const result = BootstrapEnvironment.safeParse({ ...environment, BOOTSTRAP_PASSWORD: password });
  if (!result.success)
    throw new Error(
      `Invalid bootstrap configuration: ${result.error.issues.map((issue) => issue.path.join('.')).join(', ')}. Supply every required field; the password must contain 16–128 characters.`,
    );
  return {
    email: result.data.BOOTSTRAP_EMAIL,
    name: result.data.BOOTSTRAP_NAME,
    organizationId: result.data.BOOTSTRAP_ORGANIZATION_ID,
    organizationName: result.data.BOOTSTRAP_ORGANIZATION_NAME,
    password: result.data.BOOTSTRAP_PASSWORD,
    academicAccess: result.data.BOOTSTRAP_ACADEMIC_ACCESS === 'true',
  };
}
