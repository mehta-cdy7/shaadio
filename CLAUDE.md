# Shaadio — rules for every coding session

Indian wedding-planning app. Next.js App Router + TS modular monolith on Vercel; MongoDB Atlas +
Mongoose; Zod; server-side sessions; R2, Resend, Google Places, Vercel Cron.

## Project state (paused 2026-10-17)
- Read STATUS.md first: its "Paused" section lists the production checks and the order to resume
  (backups + password reset before any real wedding, then Livestream, CSV import, Tasks).
- Migrations applied through 0008; the next one is 0009. Crons: email, cleanup, retention.
- Git: feature branch → `--no-ff` into dev → fast-forward main. Push only when asked.

## Sources of truth
- @AGENTS.md — read node_modules/next/dist/docs/ before using Next APIs.
- Authority: docs/PRD.md → SYSTEM_DESIGN → DATABASE_DESIGN → API_DESIGN. Conflict = defect: raise it, never resolve in code.
- Stack fixed (SYSTEM §4, §93). No new infra/libraries without asking.
- Each slice: dated entry in docs/IMPLEMENTATION_NOTES.md + update STATUS.md.

## Commands (`corepack pnpm`) — lint, typecheck, test, build must pass
dev | lint | format | typecheck | test | test:unit | test:int | e2e | build | db:migrate (by hand, per env).

## Boundaries (lint-enforced)
- src/app: routing only. Handlers: parse → auth → validate → service → respond. No Server Actions.
- src/modules/<domain>: logic. Cross-module imports only via `@/modules/x` or `@/modules/x/schemas`.
- src/server: infra, never imports modules. src/lib: pure isomorphic. src/components: UI, imports lib + module schemas only.
- Server files start with `import 'server-only'`. SDKs only in adapters: server/email, server/storage, server/places.
- Photos: browser resizes (src/components/photos), uploads go straight to R2, server verifies bytes.
  Reuse src/modules/gallery services; never stream image bytes through the app.

## Tenant isolation — non-negotiable (DB §6, API §3)
- weddingId only from ctx or a resolved public token — never body/query/path.
- Tenant models use tenantGuard; no findById, populate, bulkWrite.
- Native `.collection` only in src/server/db/unscoped.ts; new lookups need approval.
- Referenced ids must belong to same wedding; foreign ids → 404. Server components use same ctx as handlers.

## Data
- Dates "YYYY-MM-DD", times "HH:mm", money integer *Paise, phones E.164, emails lowercased.
- Optional = absent ($unset, never null). `.lean()` reads; targeted updateOne; never doc.save().
- Limits in the update filter, not check-then-write. Only 3 stored counters.
- Multi-write ops in transactions (no R2/Resend/Google inside); activity entry in same transaction.
- Hard delete + explicit cascades. Indexes start with weddingId, come from migrations; never syncIndexes().

## API
- Strict Zod; PATCH null clears, omitted unchanged. Errors via src/server/http/errors.ts.
- Cursor pagination for growing lists. Mutations: JSON + Origin check. `Cache-Control: no-store`.
- Public token endpoints: minimal projections; every failure identical 404.

## Secrets and logging
- Tokens: crypto.randomBytes base64url; stored as HMAC. Secret fields select:false.
- Never log tokens, passwords, cookies, bodies or token paths — log route patterns.
- New env vars: validate in src/server/env.ts + add to .env.example.

## UI
- All copy via next-intl (messages/en.json). Show errors by `code`.
- Colours/fonts/radii only from src/styles/tokens.css.
- Guest pages (/invite, /gallery, /w): server components first, minimal JS, mobile-first.

## Tests
- tests/security suites mandatory; new tenant model/endpoint adds isolation tests in same change.
- `*.int.test.ts` use in-memory replica set only. Never touch production data.
