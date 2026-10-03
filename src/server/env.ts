import 'server-only';
import { z } from 'zod';

/**
 * Server environment. Core variables are validated at boot (src/instrumentation.ts). Integration
 * variables (R2, Resend, Places, secrets) are added with the adapter that reads them, and validated
 * on first use so that builds and CI do not need every secret.
 */
const coreEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  MONGODB_URI: z
    .string()
    .regex(/^mongodb(\+srv)?:\/\//, 'must be a mongodb:// or mongodb+srv:// connection string')
    // Without a path the driver silently uses the "test" database (shaadioo-dev, -prod: SYSTEM §78).
    .regex(/^mongodb(\+srv)?:\/\/[^/]+\/[^/?]+/, 'must name the database, e.g. …/shaadioo-dev'),
  APP_ORIGIN: z.url(),
});

export type CoreEnv = z.infer<typeof coreEnvSchema>;

export class InvalidEnvError extends Error {
  override name = 'InvalidEnvError';
}

/** Parses an env source. Error messages name the variables, never their values. */
export function parseCoreEnv(source: Record<string, string | undefined>): CoreEnv {
  const result = coreEnvSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new InvalidEnvError(`Invalid server environment: ${problems}`);
  }
  return result.data;
}

let cached: CoreEnv | undefined;

export function env(): CoreEnv {
  // In development `next dev` reloads .env.local without restarting, so re-read it each time.
  if (process.env.NODE_ENV === 'development') return parseCoreEnv(process.env);
  cached ??= parseCoreEnv(process.env);
  return cached;
}

const authEnvSchema = z.object({
  // HMAC key for session, reset and invitation token hashes (DATABASE_DESIGN §5.2).
  SESSION_SECRET: z.string().min(32, 'must be at least 32 characters'),
});

export type AuthEnv = z.infer<typeof authEnvSchema>;

/** Parses the auth variables. Like parseCoreEnv, errors name variables and never echo values. */
export function parseAuthEnv(source: Record<string, string | undefined>): AuthEnv {
  const result = authEnvSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new InvalidEnvError(`Invalid server environment: ${problems}`);
  }
  return result.data;
}

let cachedAuth: AuthEnv | undefined;

/** Validated on first use, so builds and CI jobs that never authenticate do not need the secret. */
export function authEnv(): AuthEnv {
  cachedAuth ??= parseAuthEnv(process.env);
  return cachedAuth;
}
