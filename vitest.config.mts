import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// `server-only` throws outside a React Server Components build; tests run server code directly.
const serverOnlyStub = fileURLToPath(new URL('./tests/setup/server-only-stub.ts', import.meta.url));

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: { 'server-only': serverOnlyStub },
  },
  test: {
    environment: 'node',
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.ts'],
          exclude: ['**/*.int.test.ts', 'tests/e2e/**'],
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['src/**/*.int.test.ts', 'tests/**/*.int.test.ts'],
          // In-memory MongoDB replica set: a real mongod, ephemeral, never a remote database.
          globalSetup: ['tests/setup/mongo-replset.ts'],
          testTimeout: 30_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
