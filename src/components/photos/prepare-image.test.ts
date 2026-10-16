import { describe, expect, it } from 'vitest';
import { checkSelectedFile, fitWithin } from './prepare-image';

describe('fitWithin', () => {
  it('shrinks the longest side to the limit and keeps the shape', () => {
    expect(fitWithin(4032, 3024, 2560)).toEqual({ width: 2560, height: 1920 });
    expect(fitWithin(3024, 4032, 640)).toEqual({ width: 480, height: 640 });
  });

  it('never enlarges a small image', () => {
    expect(fitWithin(800, 600, 2560)).toEqual({ width: 800, height: 600 });
  });
});

describe('checkSelectedFile', () => {
  const file = (type: string, name: string, size = 1000) => ({ type, name, size });

  it('accepts photos, including HEIC reported without a type', () => {
    expect(checkSelectedFile(file('image/jpeg', 'a.jpg'))).toBeUndefined();
    expect(checkSelectedFile(file('image/heic', 'IMG_1.HEIC'))).toBeUndefined();
    expect(checkSelectedFile(file('', 'IMG_1.heic'))).toBeUndefined();
  });

  it('rejects videos, other files and anything over 15 MB (PRD §9.22)', () => {
    expect(checkSelectedFile(file('video/quicktime', 'clip.mov'))).toBe('VIDEO');
    expect(checkSelectedFile(file('application/pdf', 'menu.pdf'))).toBe('NOT_AN_IMAGE');
    expect(checkSelectedFile(file('image/jpeg', 'big.jpg', 15 * 1024 * 1024 + 1))).toBe('TOO_BIG');
  });
});
