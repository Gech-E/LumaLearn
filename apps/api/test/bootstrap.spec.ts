import { readBootstrapEnvironment } from '../src/operations/bootstrap.config';

const valid = () => ({
  BOOTSTRAP_EMAIL: ' Admin@provider.example ',
  BOOTSTRAP_NAME: 'Initial administrator',
  BOOTSTRAP_ORGANIZATION_ID: 'provider-one',
  BOOTSTRAP_ORGANIZATION_NAME: 'Education provider',
  BOOTSTRAP_PASSWORD: 'FictionalBootstrapPass!2026',
});

describe('operator bootstrap configuration', () => {
  test('requires explicit values and removes the environment secret even on failure', () => {
    for (const key of Object.keys(valid())) {
      const environment: Record<string, string | undefined> = { ...valid(), [key]: undefined };
      expect(() => readBootstrapEnvironment(environment)).toThrow(
        'Invalid bootstrap configuration',
      );
      expect(environment).not.toHaveProperty('BOOTSTRAP_PASSWORD');
    }
    const environment = { ...valid(), BOOTSTRAP_PASSWORD: 'short-secret' };
    expect(() => readBootstrapEnvironment(environment)).toThrow('16–128');
    expect(environment).not.toHaveProperty('BOOTSTRAP_PASSWORD');
  });

  test('defaults to no academic access and accepts only an explicit true opt-in', () => {
    const environment = valid();
    expect(readBootstrapEnvironment(environment)).toMatchObject({
      email: 'admin@provider.example',
      academicAccess: false,
    });
    expect(environment).not.toHaveProperty('BOOTSTRAP_PASSWORD');
    expect(
      readBootstrapEnvironment({ ...valid(), BOOTSTRAP_ACADEMIC_ACCESS: 'true' }).academicAccess,
    ).toBe(true);
    expect(() =>
      readBootstrapEnvironment({ ...valid(), BOOTSTRAP_ACADEMIC_ACCESS: 'yes' }),
    ).toThrow('BOOTSTRAP_ACADEMIC_ACCESS');
  });
});
