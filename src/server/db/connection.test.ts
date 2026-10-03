import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const connect = vi.fn();
const disconnect = vi.fn(async () => undefined);
vi.mock('mongoose', () => ({ default: { connect, disconnect } }));

const URI_A = 'mongodb://localhost:27017/shaadioo-a';
const URI_B = 'mongodb://localhost:27017/shaadioo-b';

describe('connectDb', () => {
  beforeEach(() => {
    vi.resetModules();
    delete (globalThis as { __shaadiooMongo?: unknown }).__shaadiooMongo;
    connect.mockReset();
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('APP_ORIGIN', 'http://localhost:3000');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('reuses one connection while the URI is unchanged', async () => {
    vi.stubEnv('MONGODB_URI', URI_A);
    connect.mockResolvedValue({ disconnect });
    const { connectDb } = await import('./connection');
    await Promise.all([connectDb(), connectDb()]);
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it('a late failure of a replaced attempt does not drop the newer connection', async () => {
    let failFirst!: (error: Error) => void;
    connect
      .mockImplementationOnce(() => new Promise((_, reject) => (failFirst = reject)))
      .mockResolvedValueOnce({ disconnect });
    const { connectDb } = await import('./connection');

    vi.stubEnv('MONGODB_URI', URI_A);
    const first = connectDb();
    vi.stubEnv('MONGODB_URI', URI_B); // .env.local edited while the first connect is pending
    const second = connectDb();

    await vi.waitFor(() => expect(connect).toHaveBeenCalledTimes(1));
    failFirst(new Error('server selection timed out'));
    await expect(first).rejects.toThrow('server selection timed out');
    await second;

    // The cache still holds the URI_B connection: no third connect is started.
    expect(connectDb()).toBe(second);
    expect(connect).toHaveBeenCalledTimes(2);
    expect(connect).toHaveBeenLastCalledWith(URI_B, expect.any(Object));
  });

  it('clears its own failed attempt so the next call retries', async () => {
    vi.stubEnv('MONGODB_URI', URI_A);
    connect.mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce({ disconnect });
    const { connectDb } = await import('./connection');
    await expect(connectDb()).rejects.toThrow('down');
    await connectDb();
    expect(connect).toHaveBeenCalledTimes(2);
  });
});
