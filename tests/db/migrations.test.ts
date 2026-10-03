import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MIGRATIONS } from '../../migrations/runner';

const dir = fileURLToPath(new URL('../../migrations/', import.meta.url));

describe('migration registry', () => {
  it('lists every numbered migration file, in order', () => {
    const files = readdirSync(dir)
      .filter((name) => /^\d{4}_.+\.ts$/.test(name) && !name.endsWith('.test.ts'))
      .map((name) => name.replace(/\.ts$/, ''))
      .sort();
    expect(MIGRATIONS.map((m) => m.id)).toEqual(files);
  });
});
