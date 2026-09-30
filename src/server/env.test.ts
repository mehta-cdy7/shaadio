import { describe, expect, it } from 'vitest';
import { InvalidEnvError, parseAuthEnv, parseCoreEnv } from './env';

describe('parseCoreEnv', () => {
  const valid = {
    MONGODB_URI: 'mongodb+srv://user:pass@cluster.example.net/shaadioo',
    APP_ORIGIN: 'https://shaadioo.example',
  };

  it('accepts a valid environment and defaults NODE_ENV', () => {
    expect(parseCoreEnv(valid)).toEqual({ ...valid, NODE_ENV: 'development' });
  });

  it('rejects a missing or non-mongodb URI', () => {
    expect(() => parseCoreEnv({ ...valid, MONGODB_URI: undefined })).toThrow(InvalidEnvError);
    expect(() => parseCoreEnv({ ...valid, MONGODB_URI: 'postgres://x' })).toThrow(/MONGODB_URI/);
  });

  it('names the variable but never echoes its value', () => {
    const secret = 'mongodb-but-wrong://user:hunter2@host';
    expect(() => parseCoreEnv({ ...valid, MONGODB_URI: secret })).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining('hunter2') }),
    );
  });
});

describe('parseAuthEnv', () => {
  it('accepts a secret of at least 32 characters', () => {
    const secret = 'x'.repeat(32);
    expect(parseAuthEnv({ SESSION_SECRET: secret })).toEqual({ SESSION_SECRET: secret });
  });

  it('rejects a missing or short secret without echoing it', () => {
    expect(() => parseAuthEnv({})).toThrow(/SESSION_SECRET/);
    expect(() => parseAuthEnv({ SESSION_SECRET: 'short-hunter2' })).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining('hunter2') }),
    );
  });
});
