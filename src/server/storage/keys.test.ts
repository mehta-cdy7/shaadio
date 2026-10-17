import { describe, expect, it } from 'vitest';
import {
  coverKey,
  newKeyId,
  photoKeys,
  photosPrefix,
  stagingKeys,
  stagingPrefix,
  weddingPrefix,
} from './keys';

const WEDDING = '6650a1b2c3d4e5f6a7b8c9d0';

describe('storage keys', () => {
  it('makes 128-bit base64url key ids, fresh each time', () => {
    const id = newKeyId();
    expect(id).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(newKeyId()).not.toBe(id);
  });

  it('lays out photo, cover and staging keys under the wedding (DATABASE_DESIGN §5.12)', () => {
    expect(photoKeys(WEDDING, 'k1')).toEqual({
      display: `weddings/${WEDDING}/photos/k1/d.webp`,
      thumb: `weddings/${WEDDING}/photos/k1/t.webp`,
    });
    expect(coverKey(WEDDING, 'k2')).toBe(`weddings/${WEDDING}/covers/k2.webp`);
    expect(stagingKeys(WEDDING, 'k3')).toEqual({
      display: `staging/${WEDDING}/k3/d`,
      thumb: `staging/${WEDDING}/k3/t`,
    });
    expect(weddingPrefix(WEDDING)).toBe(`weddings/${WEDDING}/`);
    expect(stagingPrefix(WEDDING)).toBe(`staging/${WEDDING}/`);
    expect(photosPrefix(WEDDING)).toBe(`weddings/${WEDDING}/photos/`);
  });

  it('refuses segments that could escape the wedding prefix', () => {
    for (const bad of ['', '../other', 'a/b', 'x y', '.']) {
      expect(() => photoKeys(WEDDING, bad)).toThrow(/invalid storage key segment/);
      expect(() => weddingPrefix(bad)).toThrow(/invalid storage key segment/);
    }
  });
});
