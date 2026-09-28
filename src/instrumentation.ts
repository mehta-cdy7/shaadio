/** Runs once per server instance at boot: fail fast on missing or invalid core configuration. */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { env } = await import('@/server/env');
    env();
  }
}
