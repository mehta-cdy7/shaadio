import { describe, expect, it } from 'vitest';
import { InvalidEnvError, parseAuthEnv, parseCoreEnv, storageEnv } from './env';

describe('parseCoreEnv', () => {
  const valid = {
    MONGODB_URI: 'mongodb+srv://user:pass@cluster.example.net/shaadio',
    APP_ORIGIN: 'https://shaadio.example',
  };

  it('accepts a valid environment and defaults NODE_ENV', () => {
    expect(parseCoreEnv(valid)).toEqual({ ...valid, NODE_ENV: 'development' });
  });

  it('rejects a missing or non-mongodb URI', () => {
    expect(() => parseCoreEnv({ ...valid, MONGODB_URI: undefined })).toThrow(InvalidEnvError);
    expect(() => parseCoreEnv({ ...valid, MONGODB_URI: 'postgres://x' })).toThrow(/MONGODB_URI/);
  });

  it('rejects a URI without a database name', () => {
    for (const uri of [
      'mongodb+srv://user:pass@cluster.example.net',
      'mongodb+srv://user:pass@cluster.example.net/',
      'mongodb+srv://user:pass@cluster.example.net/?retryWrites=true',
    ]) {
      expect(() => parseCoreEnv({ ...valid, MONGODB_URI: uri })).toThrow(/must name the database/);
    }
    expect(
      parseCoreEnv({
        ...valid,
        MONGODB_URI: 'mongodb://localhost:27017/shaadio-dev?replicaSet=rs0',
      }),
    ).toMatchObject({ MONGODB_URI: expect.stringContaining('/shaadio-dev') });
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

describe('storageEnv', () => {
  const valid = {
    R2_ACCOUNT_ID: '0123456789abcdef0123456789abcdef',
    R2_ACCESS_KEY_ID: 'access-key',
    R2_SECRET_ACCESS_KEY: 'secret-key',
    R2_BUCKET_NAME: 'shaadio-dev',
    MEDIA_BASE_URL: 'https://media.shaadio.in',
  };

  it('is off when no R2 variable is set', () => {
    expect(storageEnv({})).toBeUndefined();
  });

  it('accepts a complete configuration', () => {
    expect(storageEnv(valid)).toEqual(valid);
  });

  it('throws when partly set, naming the missing variable', () => {
    expect(() => storageEnv({ ...valid, R2_SECRET_ACCESS_KEY: undefined })).toThrow(
      /R2_SECRET_ACCESS_KEY/,
    );
  });

  it('rejects a media URL with a path or trailing slash', () => {
    for (const url of ['https://media.shaadio.in/', 'https://media.shaadio.in/photos']) {
      expect(() => storageEnv({ ...valid, MEDIA_BASE_URL: url })).toThrow(/MEDIA_BASE_URL/);
    }
  });

  it('never echoes the secret key', () => {
    expect(() => storageEnv({ ...valid, R2_ACCOUNT_ID: 'hunter2' })).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining('hunter2') }),
    );
  });
});
