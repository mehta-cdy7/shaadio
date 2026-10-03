import { describe, expect, it } from 'vitest';
import { formatPaise } from './money';

describe('formatPaise', () => {
  it('uses Indian digit grouping', () => {
    expect(formatPaise(124_500_000)).toBe('₹12,45,000');
    expect(formatPaise(0)).toBe('₹0');
  });
});
