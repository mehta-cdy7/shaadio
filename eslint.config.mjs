import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import boundaries from 'eslint-plugin-boundaries';

/**
 * Mongo access patterns that bypass or defeat the tenant guard (DATABASE_DESIGN §6, §17.2).
 * `.collection` is allowed only in src/server/db/unscoped.ts (see the override below).
 */
const COLLECTION_RULE = {
  selector: "MemberExpression[property.name='collection']",
  message:
    'Native collection access bypasses the tenant guard. Only src/server/db/unscoped.ts may use it (DATABASE_DESIGN §6.3).',
};
const OTHER_MONGO_RULES = [
  {
    selector: "CallExpression[callee.property.name='populate']",
    message:
      'populate() queries without weddingId. Load references with an explicit wedding-scoped query.',
  },
  {
    selector: "CallExpression[callee.property.name='bulkWrite']",
    message: 'bulkWrite bypasses the tenant guard. Use targeted updateOne/updateMany.',
  },
  {
    selector: "CallExpression[callee.property.name='syncIndexes']",
    message:
      'Never syncIndexes(): it drops indexes. Create indexes in a migration (DATABASE_DESIGN §17.2).',
  },
];

/** A module's public surface: server API (index.ts) and client-safe schemas (schemas.ts). */
const MODULE_PUBLIC_API = { type: 'module', fileInternalPath: ['index.ts', 'schemas.ts'] };

export default defineConfig([
  ...nextVitals,
  ...nextTs,

  // --- Mongo safety rules --------------------------------------------------------------------
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': ['error', COLLECTION_RULE, ...OTHER_MONGO_RULES],
    },
  },
  {
    files: ['src/server/db/unscoped.ts'],
    rules: {
      'no-restricted-syntax': ['error', ...OTHER_MONGO_RULES],
    },
  },

  // --- Theme: UI code uses token utilities, never raw colours (src/styles/tokens.css) ----------
  {
    files: ['src/app/**/*.tsx', 'src/components/**/*.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        COLLECTION_RULE,
        ...OTHER_MONGO_RULES,
        {
          selector: 'Literal[value=/#[0-9a-fA-F]{3,8}\\b|rgba?\\(|hsla?\\(|oklch\\(/]',
          message:
            'Raw colour in UI code. Use a token utility (bg-primary, text-ink…) from src/styles/tokens.css.',
        },
        {
          selector: 'TemplateElement[value.raw=/#[0-9a-fA-F]{3,8}\\b|rgba?\\(|hsla?\\(|oklch\\(/]',
          message:
            'Raw colour in UI code. Use a token utility (bg-primary, text-ink…) from src/styles/tokens.css.',
        },
      ],
    },
  },

  // --- Architectural boundaries (plan §B: app → modules → server + lib) ------------------------
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { boundaries },
    settings: {
      'boundaries/include': ['src/**/*'],
      'boundaries/elements': [
        { type: 'app', pattern: 'src/app' },
        { type: 'module', pattern: 'src/modules/*', capture: ['moduleName'] },
        { type: 'server', pattern: 'src/server' },
        { type: 'lib', pattern: 'src/lib' },
        { type: 'components', pattern: 'src/components' },
        { type: 'i18n', pattern: 'src/i18n' },
      ],
    },
    rules: {
      // Imports inside one element (e.g. within src/modules/guests) are not checked.
      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',
          message:
            'Import breaks the layer rules in CLAUDE.md (app → modules → server + lib; modules only via index.ts or schemas.ts).',
          policies: [
            {
              from: { element: { type: 'app' } },
              allow: {
                to: {
                  element: [
                    { types: { anyOf: ['app', 'server', 'lib', 'components', 'i18n'] } },
                    MODULE_PUBLIC_API,
                  ],
                },
              },
            },
            {
              from: { element: { type: 'module' } },
              allow: {
                to: { element: [{ types: { anyOf: ['server', 'lib'] } }, MODULE_PUBLIC_API] },
              },
            },
            {
              from: { element: { type: 'server' } },
              allow: { to: { element: { types: { anyOf: ['server', 'lib'] } } } },
            },
            {
              from: { element: { type: 'lib' } },
              allow: { to: { element: { type: 'lib' } } },
            },
            {
              // Client-safe only: components may use module schemas, never services or models.
              from: { element: { type: 'components' } },
              allow: {
                to: {
                  element: [
                    { types: { anyOf: ['components', 'lib'] } },
                    { type: 'module', fileInternalPath: 'schemas.ts' },
                  ],
                },
              },
            },
            {
              from: { element: { type: 'i18n' } },
              allow: { to: { element: { type: 'lib' } } },
            },
          ],
        },
      ],
    },
  },

  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'coverage/**',
    'playwright-report/**',
    'test-results/**',
    'next-env.d.ts',
  ]),
]);
