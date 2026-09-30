import { describe, expect, it } from 'vitest';
import { hashPassword, isCommonPassword, verifyAgainstDummy, verifyPassword } from './password';

describe('password hashing', () => {
  it('verifies the right password and rejects a wrong one', async () => {
    const hash = await hashPassword('correct horse battery');
    expect(hash).toMatch(/^scrypt\$131072\$8\$1\$[\w-]{22}\$[\w-]{43}$/);
    expect(await verifyPassword('correct horse battery', hash)).toBe(true);
    expect(await verifyPassword('correct horse batterY', hash)).toBe(false);
  });

  it('salts every hash', async () => {
    expect(await hashPassword('same password')).not.toBe(await hashPassword('same password'));
  });

  it('treats a malformed stored hash as a mismatch', async () => {
    expect(await verifyPassword('anything', 'not-a-hash')).toBe(false);
    expect(await verifyPassword('anything', 'scrypt$x$8$1$a$b')).toBe(false);
  });

  it('the dummy check always fails', async () => {
    expect(await verifyAgainstDummy('whatever password')).toBe(false);
  });

  it('flags common passwords case-insensitively', () => {
    expect(isCommonPassword('Password123')).toBe(true);
    expect(isCommonPassword('1234567890')).toBe(true);
    expect(isCommonPassword('mehndi-at-dusk-in-jaipur')).toBe(false);
  });
});
