import { describe, expect, it } from 'vitest';
import { sniffImageType } from './format';

const bytes = (...values: number[]) => new Uint8Array(values);

describe('sniffImageType', () => {
  it('recognises JPEG, PNG and WebP by their signatures', () => {
    expect(sniffImageType(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10))).toBe('image/jpeg');
    expect(sniffImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe(
      'image/png',
    );
    const webp = new TextEncoder().encode('RIFF\x10\x00\x00\x00WEBPVP8 ');
    expect(sniffImageType(webp)).toBe('image/webp');
  });

  it('rejects everything else, including truncated signatures', () => {
    expect(sniffImageType(new TextEncoder().encode('<svg xmlns='))).toBeUndefined();
    expect(sniffImageType(new TextEncoder().encode('RIFF\x10\x00\x00\x00AVI '))).toBeUndefined();
    expect(sniffImageType(bytes(0xff, 0xd8))).toBeUndefined();
    expect(sniffImageType(new Uint8Array())).toBeUndefined();
    // HEIC ("ftypheic") is converted in the browser and never accepted as stored.
    expect(sniffImageType(new TextEncoder().encode('\x00\x00\x00\x18ftypheic'))).toBeUndefined();
  });
});
