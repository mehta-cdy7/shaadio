import { describe, expect, it } from 'vitest';
import { coupleNames } from './couple';

describe('coupleNames', () => {
  it('puts the bride first unless the couple chose otherwise', () => {
    const names = { brideName: 'Princi', groomName: 'Akshay' };
    expect(coupleNames(names)).toEqual(['Princi', 'Akshay']);
    expect(coupleNames({ ...names, nameOrder: 'GROOM_FIRST' })).toEqual(['Akshay', 'Princi']);
  });
});
