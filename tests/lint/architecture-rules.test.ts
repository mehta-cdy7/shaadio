import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ESLint } from 'eslint';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Smoke test for the custom lint rules in eslint.config.mjs. Each case lints a snippet as if it
 * lived at `filePath` and asserts which rule fires. If a rule silently stops working (plugin
 * upgrade, pattern typo), this test fails.
 */
const eslint = new ESLint({ cwd: process.cwd() });

async function ruleIds(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).map((m) => m.ruleId ?? 'fatal');
}

describe('architecture lint rules', () => {
  it('bans native .collection access outside unscoped.ts', async () => {
    const code = 'declare const Guest: any;\nexport const c = Guest.collection;\n';
    expect(await ruleIds(code, 'src/server/storage/x.ts')).toContain('no-restricted-syntax');
    expect(await ruleIds(code, 'src/server/db/unscoped.ts')).not.toContain('no-restricted-syntax');
  });

  it('bans populate, bulkWrite and syncIndexes everywhere', async () => {
    for (const call of ['populate("x")', 'bulkWrite([])', 'syncIndexes()']) {
      const code = `declare const M: any;\nexport const r = M.${call};\n`;
      expect(await ruleIds(code, 'src/server/db/unscoped.ts')).toContain('no-restricted-syntax');
    }
  });

  it('stops server infrastructure importing app code', async () => {
    const code = "import RootLayout from '@/app/layout';\nexport const x = RootLayout;\n";
    expect(await ruleIds(code, 'src/server/storage/x.ts')).toContain('boundaries/dependencies');
  });

  it('stops components and lib importing server code', async () => {
    const code = "import { pingDb } from '@/server/db/connection';\nexport const x = pingDb;\n";
    expect(await ruleIds(code, 'src/components/ui/x.tsx')).toContain('boundaries/dependencies');
    expect(await ruleIds(code, 'src/lib/x.ts')).toContain('boundaries/dependencies');
  });

  it('allows app code to import server infrastructure', async () => {
    const code = "import { pingDb } from '@/server/db/connection';\nexport const x = pingDb;\n";
    expect(await ruleIds(code, 'src/app/api/x/route.ts')).not.toContain('boundaries/dependencies');
  });

  it('bans raw colours in UI code', async () => {
    for (const cls of ['bg-[#261424]', 'text-[rgb(0,0,0)]', 'border-[oklch(50%_0.1_20)]']) {
      const code = `export const A = () => <div className="${cls}" />;\n`;
      expect(await ruleIds(code, 'src/components/ui/x.tsx')).toContain('no-restricted-syntax');
    }
    const ok = 'export const A = () => <div className="bg-primary text-on-primary" />;\n';
    expect(await ruleIds(ok, 'src/app/x/page.tsx')).not.toContain('no-restricted-syntax');
  });

  describe('module entry points', () => {
    // Boundaries rules need real files to resolve, so a throwaway module is written for this block.
    // The folder name is git-ignored in case a run is interrupted before cleanup.
    const fixtureDir = join(process.cwd(), 'src/modules/__lint_fixture__');
    const MOD = '@/modules/__lint_fixture__';

    beforeAll(() => {
      mkdirSync(fixtureDir, { recursive: true });
      writeFileSync(join(fixtureDir, 'index.ts'), 'export const api = 1;\n');
      writeFileSync(join(fixtureDir, 'schemas.ts'), 'export const schema = 1;\n');
      writeFileSync(join(fixtureDir, 'thing.service.ts'), 'export const internal = 1;\n');
    });

    afterAll(() => rmSync(fixtureDir, { recursive: true, force: true }));

    const importing = (path: string) => `import * as m from '${path}';\nexport const x = m;\n`;

    it('app and other modules may import index.ts and schemas.ts only', async () => {
      for (const from of ['src/app/x/page.tsx', 'src/modules/other/x.ts']) {
        expect(await ruleIds(importing(MOD), from)).not.toContain('boundaries/dependencies');
        expect(await ruleIds(importing(`${MOD}/schemas`), from)).not.toContain(
          'boundaries/dependencies',
        );
        expect(await ruleIds(importing(`${MOD}/thing.service`), from)).toContain(
          'boundaries/dependencies',
        );
      }
    });

    it('components may import schemas.ts but not the server API', async () => {
      const from = 'src/components/ui/x.tsx';
      expect(await ruleIds(importing(`${MOD}/schemas`), from)).not.toContain(
        'boundaries/dependencies',
      );
      expect(await ruleIds(importing(MOD), from)).toContain('boundaries/dependencies');
    });

    it('server infrastructure may not import modules', async () => {
      expect(await ruleIds(importing(MOD), 'src/server/db/x.ts')).toContain(
        'boundaries/dependencies',
      );
    });

    it('files inside a module may import each other', async () => {
      const from = 'src/modules/__lint_fixture__/other.ts';
      expect(await ruleIds(importing('./thing.service'), from)).not.toContain(
        'boundaries/dependencies',
      );
    });
  });
});
