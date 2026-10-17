import { beforeAll, describe, expect, it } from 'vitest';
import { signValue, verifyValue } from './signed';

describe('signed values', () => {
  beforeAll(() => {
    process.env.SESSION_SECRET = 'unit-test-session-secret-0123456789abcdef';
  });

  const later = () => new Date(Date.now() + 60_000);

  it('round-trips a value until it expires', () => {
    const signed = signValue('cover', { w: 'abc' }, later());
    expect(verifyValue('cover', signed)).toMatchObject({ w: 'abc' });
    expect(verifyValue('cover', signed, new Date(Date.now() + 120_000))).toBeUndefined();
  });

  it('rejects tampering, another purpose and junk', () => {
    const signed = signValue('cover', { w: 'abc' }, later());
    const [body, sig] = signed.split('.');
    const forged = Buffer.from(JSON.stringify({ w: 'xyz', exp: Date.now() + 60_000 })).toString(
      'base64url',
    );
    expect(verifyValue('cover', `${forged}.${sig}`)).toBeUndefined();
    expect(verifyValue('other', signed)).toBeUndefined();
    expect(verifyValue('cover', `${body}.${sig}.x`)).toBeUndefined();
    expect(verifyValue('cover', 'nonsense')).toBeUndefined();
  });
});
