import { describe, expect, it } from 'vitest';
import { isActive } from './nav-items';

describe('isActive', () => {
  it('matches the dashboard exactly and sections by prefix', () => {
    expect(isActive('/app', '/app')).toBe(true);
    expect(isActive('/app', '/app/events')).toBe(false);
    expect(isActive('/app/events', '/app/events/abc')).toBe(true);
    expect(isActive('/app/events', '/app/eventsx')).toBe(false);
  });
});
