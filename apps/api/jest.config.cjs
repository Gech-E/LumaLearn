module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/*.spec.ts', '**/*.e2e-spec.ts'],
  testTimeout: 60000,
  maxWorkers: 1,
  setupFiles: ['dotenv/config'],
};
