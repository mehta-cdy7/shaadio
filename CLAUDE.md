# Shaadioo — rules for every coding session

Indian wedding-planning web app. Next.js App Router + TypeScript modular monolith on Vercel;
MongoDB Atlas + Mongoose; Zod; custom server-side sessions; R2, Resend, Google Places, Vercel Cron.

## Sources of truth
- @AGENTS.md — Next.js-managed: read the bundled docs in node_modules/next/dist/docs/ before using Next APIs.
- Authority: docs/PRD.md → SYSTEM_DESIGN.md → DATABASE_DESIGN.md → API_DESIGN.md.
  A conflict is a defect: stop and raise it, never resolve it locally in code.
- Stack and exclusions are fixed (SYSTEM §4, §93). Don't add infrastructure or libraries without asking.
- Each finished slice/PR: add a dated entry to docs/IMPLEMENTATION_NOTES.md and update STATUS.md.

## Commands (pnpm via `corepack enable`) — lint, typecheck, test, build must pass before done
pnpm dev | lint | format | typecheck | test (unit + integration) | test:unit | test:int | e2e | build.

## Structure and boundaries (lint-enforced, covered by tests/lint)
- src/app: routing only. Handlers: parse → auth → validate → call service → respond (SYSTEM §58).
- src/modules/<domain>: business logic. Cross-module imports only via `@/modules/x` or `@/modules/x/schemas`.
- src/server: infrastructure, never imports modules. src/lib: pure isomorphic utils.
- src/components: UI; may import lib and module schemas only. Server files start with `import 'server-only'`.
- SDKs only in adapters: Resend → server/email, S3 client → server/storage, Places → server/places.
- Mutations go through /api route handlers. No Server Actions.

## Tenant isolation — non-negotiable (DATABASE_DESIGN §6, API §3)
- weddingId comes from ctx (withMember / server-component equivalent) or a resolved public token.
  Never from body, query or path.
- Every tenant model uses the tenantGuard plugin; queries without weddingId throw.
  No findById, populate or bulkWrite on tenant models.
- Native `.collection` access only in src/server/db/unscoped.ts. Adding a lookup there needs approval.
- Verify every referenced id belongs to the same wedding (DB §6.4). Foreign ids → 404, never 403.
- Server components call services with the same ctx as route handlers (API-08).

## Data (DATABASE_DESIGN §1, §8–§10, §14, §17)
- Dates "YYYY-MM-DD", times "HH:mm" wall-clock, money integer *Paise, phones E.164, emails lowercased.
- Optional = absent: clear with $unset, never store null. `.lean()` reads; targeted updateOne; never doc.save().
- Limits live in the update filter, not check-then-write. Only 3 stored counters.
- Multi-write ops use transactions; never call R2/Resend/Google inside one.
- Logged mutations write their activity entry in the same transaction. Hard delete + explicit cascades.
- Indexes start with weddingId; production indexes come from migrations; never syncIndexes().

## API (API_DESIGN §1–§8)
- Strict Zod schemas; PATCH null clears, omitted unchanged. Errors via src/server/http/errors.ts (§4).
- Cursor pagination for growing lists. Mutations: JSON only + Origin check. `Cache-Control: no-store`.
- Public token endpoints: minimal projections; every failure is the identical 404.

## Secrets and logging
- Tokens: crypto.randomBytes, base64url. Stored token hashes are HMAC. Secret fields are select:false.
- Never log tokens, passwords, cookies, bodies or concrete token paths — log route patterns (API §8.2).
- Env vars are validated in src/server/env.ts; add new ones there and to .env.example.

## UI
- All user-facing text via next-intl (messages/en.json). Show errors by `code`, not server `message`.
- Colours/fonts/radii only from src/styles/tokens.css — no raw hex in components.
- Guest pages (/invite, /gallery, /w): server components first, minimal client JS, mobile-first (SYSTEM §3.6).

## Tests
- tests/security suites (SYSTEM §91, DB §6.5, API §30) are mandatory. A new tenant model or endpoint
  adds its isolation tests in the same change.
- Integration tests (`*.int.test.ts`) use the in-memory replica set only. Never touch production data.
