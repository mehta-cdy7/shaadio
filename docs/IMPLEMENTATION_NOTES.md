# Shaadioo — Implementation Notes

This file records **what has actually been built and when**. `SYSTEM_DESIGN.md` describes the intended design; this file describes reality, including the places where the two differ and why.

Keep entries dated, newest last. When an entry contradicts `SYSTEM_DESIGN.md`, either the code or the design document is wrong — say which, and resolve it rather than leaving both.

---

## 2026-09-16 — Guest invitation and public RSVP

Admin/Manager guest details retrieve the stable sharing URL; public `/invite/:token` and invitation APIs require no account.

Guest invitation services own token resolution, minimal public projections, capacity validation, repeat-response idempotency and wedding-scoped summaries. The events repository loads only active invited events within that wedding. Atomic guest version/capacity checks prevent lost updates across organiser edits and RSVP submissions.

The public page follows the approved Stitch floral hero, overlapping RSVP status card, dated itinerary and formal response form. It retains input on failure and refreshes permitted details on focus. Generic unavailable states hide deleted or invalid links.

Application logging excludes token-bearing request paths, and `no-store` / `no-referrer` / `noindex` protections apply. RSVP writes reuse the MongoDB rate-limit mechanism (300/minute globally; 20 per invitation per 15 minutes) with HMAC counter keys. Token/owner resolution and capacity validation precede quota use; per-invitation admission precedes shared admission, so invalid links and rejected per-invitation attempts do not spend shared capacity.

Dashboard RSVP groups and people attending use saved data.

Out of scope for this increment: guest email delivery, bulk actions, reminders, deadlines, individual guest rosters, dietary preferences, transport, room allocation.

**Design alignment:** matches `SYSTEM_DESIGN.md` §22, §23, §67.

### Known gaps against the current design

Added 2026-09-23 when `DATABASE_DESIGN.md` revision 1 was written. Reconcile the existing models against it.

1. **"Active" events.** This increment loads only *active* invited events, which implies events are soft-deleted. The design is now hard delete with a cascade (`DATABASE_DESIGN.md` §14.1, DB-10). Remove the active/archived flag and its filters. **Open.**
2. **Invited-events shape.** The design stores `invitedEvents: [{ eventId }]` on the guest, with no `guest_invitations` collection (ADR-17). If the code uses a separate collection or a bare id array, migrate before real data exists. **Verify.**
3. **RSVP field shape.** The design nests the answer as `rsvp.status`, `rsvp.attendingCount`, `rsvp.respondedAt`, `rsvp.respondedVia` (§5.8). `respondedVia` powers the pilot metric; add it if missing. **Verify.**
4. **Capacity check location.** RSVP capacity must be checked inside the update filter (`maxPeople: { $gte: count }`), not only by a version match (§10). **Verify.**
5. **Tenant guard.** Add the Mongoose tenant guard and the unscoped-access module (§6.2, §6.3), plus the guard tests (§6.5). **Open.**

---

## 2026-09-18 — Organiser gallery storage

`src/modules/photos` owns schemas, the Photo model, wedding-scoped persistence and gallery use cases. `src/server/storage/r2.ts` owns R2 signing and object operations. The AWS S3 client and S3 request presigner are used for R2's S3-compatible API; no external queue or service is introduced.

The private adapter uses server-only `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` and `R2_BUCKET_NAME`. `R2_PUBLIC_BASE_URL` is unused. CORS needs only `Content-Type` for browser PUTs (Content-Length is set by the browser), plus GET/PUT/HEAD and the allowed app origins. Credentials are never exposed and the bucket is never public. Development and production use separate bucket-scoped credentials; Preview deployments still require their own setup.

The browser uploads directly to a staging key. The server verifies length, MIME and a 16-byte format signature, pinning inspection and copying to the same ETag. R2 copies into an independent final key, then MongoDB atomically publishes the row. Neither the upload body nor downloaded originals pass through an app API.

Selected files and partial results remain in memory across session expiry in the same tab; confirmation can retry after signing in again. An identity/wedding change discards that draft. Refreshing or closing the tab cannot restore File objects; the existing unsaved-changes guard warns before navigation. No persistent file cache is stored in localStorage.

**Verification:** `npm test` uses mocked persistence/storage and component tests. `RUN_R2_SMOKE=1 npm test -- src/server/storage/r2.integration.test.ts` explicitly loads `.env.local`, refuses any bucket other than the dev bucket, and uploads/reads/deletes only a unique test-fixtures prefix. It never uses MongoDB.

**Design alignment:** the staging → verify → copy → publish pipeline matches `SYSTEM_DESIGN.md` §39 and §40.

### Known gaps against the current design

These were true at the time of writing and must be closed before the pilot gallery is used:

1. **Originals, not derivatives.** This increment stores and browses full uploads, downloading up to 10 MiB per image. `SYSTEM_DESIGN.md` §37 and ADR-15 now require browser-side display (≤ 2560 px) and thumbnail derivatives, with originals not retained. **Open.**
2. **HEIC.** The 16-byte signature check must be reached only after in-browser HEIC conversion, or every iPhone upload fails. **Verify.**
3. **Photo quota.** The 2,000-per-wedding cap with atomic reservation (§97) is not implemented. **Open.**
4. **Per-device limits.** Per-device and per-IP upload limits (§97) are not implemented. **Open.**
5. **Cleanup/reconciliation** of abandoned staging objects and released reservations (§54, §83) remains follow-up work. **Open.**
6. **Bucket naming.** Dev bucket is still named after the previous product name; rename to `shaadioo-dev` (§78). **Open.**
7. **Photo URLs.** This increment serves photos through signed private URLs and leaves `R2_PUBLIC_BASE_URL` unused. `SYSTEM_DESIGN.md` §42 and `API_DESIGN.md` API-11 now use direct URLs (`MEDIA_BASE_URL` + unguessable key) from a media domain that serves objects by key without listing. Set up the media domain and switch the URL builder. **Open.**

---

## 2026-09-24 — Walking skeleton (this repository)

This is the first entry for this repository. The two entries above describe an earlier codebase that is **not** in this repo; treat their "known gaps" as requirements for the rebuild, not as existing code.

Built: a Next.js 16 App Router + TypeScript app with no product features.
- **Routes.** Route groups `(marketing)`, `(auth)`, `(members)` and `(public)`. Only `/` has a page. `(public)` sets `noindex` and `no-referrer`.
- **Health endpoint.** `GET /api/health` pings MongoDB and returns 200 or 503 (now listed in API_DESIGN §9).
- **Server infrastructure.**
  - `src/server/env.ts` validates core env with Zod; it runs at boot via `src/instrumentation.ts` and is lazy at build time.
  - `src/server/db/connection.ts` holds a cached, small-pool connection; `autoIndex` is off in production.
  - `src/server/db/tenant-guard.ts` (DATABASE_DESIGN §6.2).
  - `src/server/db/unscoped.ts` (header only, lists the 9 allowed lookups).
  - `src/server/http/errors.ts` (API_DESIGN §4 envelope).
- **Styles and i18n.** Tailwind v4 tokens in `src/styles/tokens.css`. next-intl with `messages/en.json`.
- **Empty folders** for every module and adapter in the agreed layout.

Tooling:
- pnpm 12 via corepack; ESLint 9 flat config; Prettier.
- Architecture lint: eslint-plugin-boundaries layers, module entry points `index.ts`/`schemas.ts`, and bans on `.collection` (outside `unscoped.ts`), `populate`, `bulkWrite` and `syncIndexes`.
- Vitest projects `unit` and `integration`; integration uses a mongodb-memory-server replica set.
- Playwright on mobile and desktop profiles; GitHub Actions CI.
- Rules for coding sessions are in `CLAUDE.md`. `AGENTS.md` is managed by `next dev`.

Environment variables: `MONGODB_URI` (must be a replica set) and `APP_ORIGIN`. Everything else is listed, commented out, in `.env.example`.

**Verification:**
- `pnpm lint`, `pnpm typecheck` and `pnpm test` pass: 37 tests, including the tenant-guard suite covering every guarded op plus `findById`, `populate`, `bulkWrite`, `estimatedDocumentCount` and aggregates, and the lint-rule smoke tests.
- `pnpm build` passes with no env vars set.
- `pnpm e2e` passes: 6 tests against an in-memory MongoDB.
- Checked by hand: an unreachable database gives 503; missing env stops server boot with a message that names the variables but not their values.

**Design alignment:**
- Implements SYSTEM_DESIGN §55 and DATABASE_DESIGN §6.2–§6.3 (guard + audit module), §1.11 (`autoIndex`) and §17.2.
- The guard goes beyond the §6.2 sketch: it also blocks `distinct`, `findOneAndReplace`, `estimatedDocumentCount`, `bulkWrite` and `populate`, and treats `weddingId: null` as unscoped.
- File names are kebab-case (`tenant-guard.ts`); the DATABASE_DESIGN §6.2 comment has been updated to match.

### Known gaps
1. **Node version.** `.nvmrc` pins Node 24 for CI; the local machine runs Node 22.23 (`engines` allows >= 22.12). **Open.**
2. **Pinned toolchain.** TypeScript is pinned to 6.0.x because typescript-eslint supports < 6.1. ESLint is pinned to 9.x because the react/import/jsx-a11y plugins do not support ESLint 10 yet. Revisit when they do. **Open.**
3. **Placeholder design tokens.** Values in `tokens.css` and `themes.css` are placeholders until the Stitch export lands. **Open.**
4. **Doc inconsistencies not yet resolved** (setup discussion, 2026-09-24):
   - PRD §16 milestone order vs backups (SYSTEM §99)
   - PRD §14 vendor edge cases vs ADR-14
   - PRD §9.17 vs API §19 discovery fields
   - API §7 gallery IP limit vs SYSTEM §97
   - session cookie `Max-Age` vs sliding expiry
   - `firstOpenedAt` set by link-preview bots
   - stale SYSTEM field and route names

   **Open.**

---

## 2026-09-28 — Slice 0: design foundation + public landing page

Built:
- **Theme tokens** (`src/styles/tokens.css`), in three layers:
  - brand values (`--sh-brand-*`);
  - semantic roles (`--sh-canvas`, `--sh-primary`, `--sh-primary-hover`…), whose shades are derived with `color-mix()`;
  - Tailwind utilities (`bg-primary`, `text-ink`, `border-line`…).

  Values come from the Stitch design system "Royal Velvet Fig & Warm Alabaster" (primary `#261424`, secondary `#BCA177`). Re-theming means editing layer 1. The type scale, radii and shadows are tokens too.
- **Dark mode** follows the OS setting; `<html data-color-scheme="light|dark">` forces a scheme, ready for a future toggle. In dark mode the primary action uses the secondary (brass) colour.
- **Fonts:** Bodoni Moda (display) and Inter (body), self-hosted with `next/font`.
- **UI components** in `src/components/ui`: Button/ButtonLink (primary, outline, ghost, inverse), Container, Section, Eyebrow/Heading/Lead, Card, Badge, and inline SVG icons. Plus `src/lib/cn.ts`.
- **Landing page `/`** in `src/app/(marketing)` with 12 section components: header, hero, workspace preview, problem, 4 feature chapters, guests, Indian weddings, how it works, privacy, FAQ (native `<details>`), final call to action, footer. It is fully static: no session, database or client JavaScript.
- **Static images** in `public/images/landing/*.webp` (about 245 KB in total). They were rendered from Stitch's HTML mock-ups with a transparent background so they work in both schemes.
- **Copy** is in `messages/en.json` under `landing`. Translation keys are type-checked (`src/i18n/next-intl.d.ts`).
- **Links:** "Start planning" goes to `/signup` and "Sign in" to `/login`. Both show a "Coming soon" placeholder (`src/app/(auth)/_components/coming-soon.tsx`, `noindex`) until slice 1 replaces them with the real forms.

**Copy corrected against the PRD.** The Stitch landing copy and mock-ups promised things V1 does not do; these were removed or reworded:
- separate permissions per bride/groom side (PRD Rule 6)
- splitting payments between families, budgets and buffers (§7)
- room allocation (§7)
- dietary tracking and individual people inside a household (§7)
- "WhatsApp API sync" (§9.14)
- end-to-end encryption and full-resolution originals (§9.22)
- "export your data"
- real-time sync
- invented social proof
- links to Terms and Contact pages that do not exist

The "Sample invitation" link now points to "How it works", because no sample exists yet. The landing page in Stitch used Fraunces; the design system specifies Bodoni Moda, so we use Bodoni Moda.

**Guardrail:** ESLint bans raw colours (`#hex`, `rgb()`, `hsl()`, `oklch()`) in `src/app/**/*.tsx` and `src/components/**/*.tsx`. The lint-rule smoke test covers it.

**Verification:**
- lint, format, typecheck, test (38 passing) and build all green.
- e2e passes 18 tests (mobile + desktop): landing sections, the `/signup` link, FAQ opens, no sideways scroll on mobile, changing `--sh-brand-primary` recolours the primary button, OS dark mode changes the page, `data-color-scheme` forces a scheme, health, not-found.
- Screenshots reviewed at 1280px and 390px, light and dark.

**Design alignment:** PRD §12.3 (mobile), §12.6 (translation-ready), SYSTEM_DESIGN §3.6 (guest pages light: none yet), §28 (themes override brand values).

### Known gaps
1. **No guest-facing designs yet** (invitation, gallery, website) and no mobile screens in Stitch. They are needed before slices 5 and 7. **Open.**
2. **Mock-up images are raster.** Any change to them means re-rendering from Stitch. **Open.**
3. **No colour-scheme toggle in the UI.** The attribute hook is in place. **Open.**
4. **Hero image text mismatch.** The couple's names in the hero image ("Priyanka & Nick") do not match the monogram ("A & P"). Cosmetic; fix in Stitch. **Open.**
5. **Focus on the primary band.** In dark mode the band and the focus ring were both brass, so keyboard focus was invisible on the final call to action. Fixed with a `--sh-on-primary-accent` token that `Section tone="primary"` uses for focus rings, also used for the link underline there; covered by an e2e test. **Closed.**

---

## 2026-09-30 — Tenant guard: weddingId must name one wedding

The tenant guard (`src/server/db/tenant-guard.ts`) only checked that `weddingId` was present in the filter. A filter like `{ weddingId: { $ne: id } }`, `{ $exists: true }` or `{ $in: [a, b] }` passed the guard and matched other weddings' documents. The guard now accepts only an exact value: an ObjectId, its hex string, or `{ $eq: <that> }`. Anything else throws `UnscopedQueryError`. The same check applies to an aggregate's first `$match`. The check is the exported pure function `isSingleWeddingId`.

**Verification:**
- Unit tests for `isSingleWeddingId` (23 cases: accepted forms, and every operator, regex, array, null and malformed form rejected).
- Integration tests: `find`, `updateMany` and `aggregate` with `$ne`, `$exists`, `$in`, `$nin`, `$gt` and `$not` throw and leave the other wedding untouched; `$eq` and hex strings still work.
- lint, format, typecheck, unit tests and build pass locally. The integration tests could not run in the cloud session (the MongoDB binary download is blocked there); CI runs them.

**Design alignment:** DATABASE_DESIGN §6.2 and §6.5. The §6.2 sketch checks `weddingId === undefined`; this implements its intent (a query scoped to one wedding) more strictly. The sketch itself is unchanged.

### Known gaps
1. **Replacements can move a document.** `replaceOne`/`findOneAndReplace` with a correct filter could write a different `weddingId` in the replacement document. No tenant model uses replace yet. **Open.**

---

## 2026-09-30 — Slice 1a: accounts and sessions (API only)

Email/password accounts with server-side sessions. The sign-in and sign-up pages still show "Coming soon"; they are built in slice 1b from the Stitch designs.

- **Endpoints** (API_DESIGN §10): `POST /api/auth/signup`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/me`. `/api/me` returns only `user` until weddings exist.
- **Module `src/modules/auth`:** `users` and `sessions` models, strict Zod schemas (shared with the future forms), the auth service, and `withUser`, the route wrapper for signed-in endpoints. `withMember` will build on it.
- **Infrastructure:**
  - `src/server/auth`: random tokens and their HMAC, scrypt password hashing, the common-password list, and the `sid` cookie.
  - `src/server/http/route.ts`: `handler()` adds the request id and `no-store` and maps errors; `readJson()` enforces Origin, JSON content type, the 64 KB limit and strict validation (API_DESIGN §2.2, §8.3).
  - `src/server/rate-limit`: fixed-window counters in `rate_limits` with HMACed keys. Limits: login 10 per 15 min per email and 30 per 15 min per IP; signup 10 per hour per IP. A 429 carries `Retry-After`.
  - `src/server/db/transaction.ts`: `withTransaction()`.
- **Password hashing** uses Node's built-in `crypto.scrypt` (N=2^17, r=8, p=1, the OWASP minimum). This means no new dependency and no native build on Vercel. The parameters are stored in each hash, so they can be raised later.
- **Environment:** `SESSION_SECRET` (at least 32 characters) is now required wherever auth runs. It is validated on first use, like the other integration variables.
- **Migration** `migrations/0001_auth_indexes.ts` creates the unique email index, the session indexes and the TTL indexes.

**Verification:**
- lint, format, typecheck, unit tests (56) and build pass.
- Integration tests (44) pass, including the new `tests/security/auth.int.test.ts`. It covers: only hashes stored, EMAIL_TAKEN in any letter case, short and common passwords, server-owned fields rejected, Origin 403, non-JSON 400, identical errors for an unknown email and a wrong password, logout invalidation, expired sessions, the sliding expiry, per-email and per-IP rate limits, and hashed rate-limit keys.
- In cloud sessions, MongoDB comes from conda-forge because the usual download is blocked. See `MONGOMS_SYSTEM_BINARY` in the team notes.

**Design alignment:** SYSTEM_DESIGN §8–§11 and §67; DATABASE_DESIGN §5.1, §5.2 and §5.16; API_DESIGN §2, §4, §7, §8 and §10. Deliberate differences:
- Login writes the new session and `lastLoginAt` in one transaction.
- Logout requires a JSON `{}` body like every other mutation.

### Known gaps
1. **Signup with a member invitation** (`memberInviteToken`) is not accepted yet. It lands with member invitations in slice 1b or 1c. **Open.**
2. **Forgot and reset password** are not built. They need the Resend adapter and the transactional reserve. **Open.**
3. **No migration runner yet.** `0001_auth_indexes.ts` exists, but nothing applies it or records it in `schema_migrations`. It must run before production signup. Development relies on `autoIndex`. **Open.**
4. **Safari and `Secure` on http://localhost.** Safari may refuse `Secure` cookies over plain http on localhost. Check this during slice 1b. **Verify.**
5. **`PATCH /api/me` and `POST /api/me/password`** are not built. **Open.**

---

## Template for future entries

```
## YYYY-MM-DD — <area>

What was built. Which modules own what. Which environment variables or
external resources it needs.

**Verification:** how it was tested.

**Design alignment:** which SYSTEM_DESIGN.md sections it implements, and
any place it deliberately differs.

### Known gaps
Numbered, each marked Open / Verify / Closed.
```
