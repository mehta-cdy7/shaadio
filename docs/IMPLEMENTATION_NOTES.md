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
2. **Mock-up images are raster.** Any change to them means re-rendering from Stitch. **Closed** (2026-09-29: the mock-ups are components now).
3. **No colour-scheme toggle in the UI.** The attribute hook is in place. **Open.**
4. **Hero image text mismatch.** The couple's names in the hero image ("Priyanka & Nick") do not match the monogram ("A & P"). Cosmetic; fix in Stitch. **Closed** (2026-09-29: the hero image was replaced by a component).
5. **Focus on the primary band.** In dark mode the band and the focus ring were both brass, so keyboard focus was invisible on the final call to action. Fixed with a `--sh-on-primary-accent` token that `Section tone="primary"` uses for focus rings, also used for the link underline there; covered by an e2e test. **Closed.**

---

## 2026-09-29 — Landing page: new Stitch theme, coded mock-ups, copy within V1 scope

Built:
- **New theme** from the Stitch design system "Shaadioo" (Stitch project `17426117529538129036`), replacing "Royal Velvet Fig & Warm Alabaster". Changes to layer 1 of `src/styles/tokens.css`:
  - primary `#4A2943` (was `#261424`), plus deep plum `#32142D` for the closing band and plum headings, and blush `#FFD7F2`;
  - brass `#BCA177` stays as the decorative accent. Dark brass `#715B37` is new, for brass-coloured text, icons and bars: `#BCA177` on the canvas is 2.3:1, so the old eyebrows failed WCAG;
  - sandalwood `#FDDEB0` for pending states; sage `#3F6B4E` (unchanged) for attending and done;
  - muted text `#4E444A` and danger `#BA1A1A`, as Stitch renders them;
  - Playfair Display replaces Bodoni Moda (`next/font`, self-hosted);
  - the Stitch type scale (48/32/24/20 headings, 16/14/13 body, 12/11 labels), radii (12px controls, 16px cards, 54px arch top) and a plum-tinted shadow.

  Where the Stitch design notes and the rendered screen disagree, the tokens follow the rendered screen.
- **Surfaces** `canvas-muted`, `canvas-sunken` and `fill` are derived from the canvas and ink with `color-mix()`, tuned to the section colours Stitch renders.
- **Dark mode** now derives from the deep plum, so it stays close to slice 0. The closing band uses the primary plum in dark mode, because the deep plum is only 1.16:1 against the dark canvas.
- **Focus ring** is dark brass on light backgrounds (6.1:1). The closing band swaps in brass through `--sh-on-band-focus`, which replaces `--sh-on-primary-accent`.
- **RSVP colours:** Attending is green (5.1:1), Pending is sandalwood, Not attending is neutral. Labels use the PRD's words (§9.7), not Stitch's "Confirmed" and "Declined". `Badge` gained `success`, `pending`, `soft` and `plain` tones and a brass `dot`.
- **Mock-ups are components.** The six WebP screenshots (hero, workspace, four chapters) are replaced by server components in `src/app/(marketing)/_components/mocks/`:
  - they follow the theme, including dark mode;
  - all their text is in `messages/en.json`;
  - they add no client JavaScript, and removing the images saved about 245 KB;
  - each is a `role="img"` with one description, so screen readers skip the sample data.
- **Layout** follows the new Stitch screen: arch-mark logo, jaali lattice behind the hero, a two-line heading with an italic plum line, arched feature cards, icon cards, card-style FAQ (first answer open), and a closing band with arch outlines.
- **One sample wedding everywhere:** Priyanka & Nik, 14 February 2027, Dehradun, 42 days to go. 186 invitations for 612 people; 132 families attending, 420 people; ₹24,50,000 in expenses. The numbers agree across sections.

**Copy corrected against the PRD again.** The new Stitch screen, and the text baked into the old WebP images, promised things V1 does not do. These were removed or reworded:
- hotel rooms and room lists; airport cabs (§7)
- budgets, targets, "remaining" (§7, §9.15)
- "real-time sync", live headcounts, per-plate estimates (Rule 8, §7)
- separate bride's-side and groom's-side workspaces and "role boundaries" (Rule 6)
- settling up between families, advances, deposits, RTGS (§7)
- "private HD livestream", video albums, full-resolution archives, "zero compression", keeping photos "forever" (§7, §9.22, §9.24)
- per-event "Attending" buttons on the invitation (V1.1, §9.11); "Delivered via WhatsApp" and "Link opened", which are not tracked (§9.14)
- table numbers, dietary choices, time zones
- "free for up to 500 guests", "© 2025 Shaadioo Technologies Inc.", Terms and Contact links, and a profile icon in the signed-out header
- a guessable invitation URL (`…?to=the-kapoors`), now a 22-character token like the real ones (§9.9, DATABASE_DESIGN token format)

The activity feed shows only actions the activity log records (§9.26).

**Guardrail:** `tests/content/landing-copy.test.ts` fails if any `landing` string mentions those topics again. Run against the original Stitch text, it flags all ten categories.

**Verification:**
- Lint, format, typecheck, test (49 passing, unit and integration) and build are all green; `/` is still static.
- e2e: all 22 landing tests pass on mobile and desktop. New tests check that each mock-up is one described image, and that the closing band's focus ring has at least 3:1 contrast in light and dark. The smoke test for `/api/health` fails locally only because no MongoDB is running on `localhost:27017`.
- Screenshots reviewed at 1280px and 390px, light and dark, against the Stitch screen. Desktop page height is 8583px (Stitch: 8646px).
- Found and fixed during verification: on phones, single-column grids grew to their widest content, and the invite link pushed the page 62px sideways. Every landing grid now sets `grid-cols-1`.

**Design alignment:** mock-up content follows PRD §6–§7, §9.3, §9.6–§9.11, §9.15 and §9.20–§9.26. SYSTEM_DESIGN §28 (themes override layer 1). CLAUDE.md UI rules: all text through next-intl, colours only from tokens.

### Known gaps
1. **The Stitch file still shows the out-of-scope copy.** Only the repository was fixed; editing the Stitch screen regenerates it with AI. **Open.**
2. **Navigation keeps Features / How it works / Privacy / FAQ** instead of Stitch's "Dashboard" and "RSVP Experience": a "Dashboard" link on a signed-out page reads as a way into the app. **Open, design decision.**
3. **Still no guest-facing or mobile screens in Stitch** (slice 0, gap 1). **Open.**
4. **The hero's second button says "See how it works"** because there is no sample invitation page yet (Stitch: "See a sample invitation"). **Open.**

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
4. **Safari and `Secure` on http://localhost.** Confirmed: sign-up succeeded but the browser dropped the cookie, so `/onboarding` redirected to `/login`. Fixed on 2026-10-03: `next dev` on an `http:` `APP_ORIGIN` omits `Secure`. Every other environment, including `next start` in CI and production, still sends it (API_DESIGN §2.1). Checked in Playwright WebKit. **Closed.**
5. **`PATCH /api/me` and `POST /api/me/password`** are not built. **Open.**

## 2026-10-03 — Slice 1b (part 1): sign-in page, auth designs in light and dark, account deletion in PRD

`/login` replaces the coming-soon placeholder. The page follows the Stitch "Sign In" screen, recoloured to the landing page's tokens in both colour schemes.

- **Stitch:** the three auth screens (Sign In, Create Account, Join by Invitation) used their own palette (navy ink `#2C3A47`, champagne gold `#D4AF37`) and Bodoni Moda. They were restyled to the landing tokens (plum `#4A2943`, brass `#BCA177`, Fig-Ink, Raw Silk Sand side panel). Dark versions were added using the coded landing dark mode: plum-black canvas, brass primary button with plum text. The coded landing (`tokens.css`) is the reference for both schemes, not the Stitch dark landing, which drifted to `#D4AF37`. Stitch still has a stray Bodoni Moda reference in some screens' configs. The code uses Playfair Display everywhere.
- **Tokens:** a new `panel` role (`#EFE8DC` light, lifted plum dark) for the auth side panel and read-only inputs.
- **Shared UI:** `components/ui/` adds `Alert`, `Field` + `inputClasses`, `PasswordInput` (Show/Hide) and `AlertIcon`. `Logo` moved there from the landing page, and `CEREMONIES` moved to `lib/ceremonies.ts`, so auth pages can use them.
- **Errors (CLAUDE.md "show errors by code"):** `lib/api.ts` `postJson()` never throws. It returns `{ ok: false, code, details, requestId }` and drops the server's `message`. `useApiErrorMessage()` maps each code to `messages/en.json` `errors.*`. Every failure shows something:
  - `INVALID_CREDENTIALS` → "Email or password is incorrect."
  - `RATE_LIMITED` → "Try again in N minutes" (from `retryAfterSeconds`).
  - `NETWORK_ERROR` (no response) → "check your connection".
  - Any other code → a generic message plus the `requestId` to quote.
  
  Field checks run on the client with the shared `loginSchema` before any request.
- **After sign-in** the page goes to `/app` if the user has a wedding, otherwise to `/onboarding` (`afterSignInPath`). Both pages arrive in slice 2.
- **PRD:** account deletion added (§9.25 Account, §13, §14, M4). API §32 and DB §20 now point to it.

**Verification:**
- lint, format, typecheck, unit + integration tests (116) and build pass.
- New `tests/e2e/login.spec.ts` stubs `/api/auth/login` to check the field checks, wrong credentials, rate limit, an unexpected error with its reference, network failure and Show/Hide. All 38 login + landing e2e tests pass on mobile and desktop.
- Screenshots reviewed at 1280px and 390px in light and dark.

**Design alignment:** PRD §9.1; API_DESIGN §4 and §10 (login); SYSTEM_DESIGN §7.1. Deliberate differences from Stitch:
- No "Forgot password?" link until slice 9 builds that page.
- The footer links Home and `/#privacy`, because no Terms page exists.

### Known gaps
1. **`/app` and `/onboarding` do not exist yet**, so a successful sign-in lands on the 404 page until slice 2. **Closed** for `/onboarding` by the placeholder below; `/app` remains for slice 2.
2. **A signed-in user can still open `/login`.** Redirect them once `/app` exists. **Open.**
3. **"Forgot password?" link** is hidden until slice 9. **Open.**
4. **Local dev DB:** the earlier 500s came from `SESSION_SECRET` missing in `.env.local`, not from the database. With it set, sign-in works end to end against the Atlas dev cluster: a wrong password shows the incorrect-credentials banner, and a correct one sets the `sid` cookie and goes to `/onboarding`. The local URI also had no database name, so the driver silently used `test`. It now ends in `/shaadioo-dev`, and `env.ts` rejects a `MONGODB_URI` without a database name. **Closed.**
5. **Account deletion design:** the endpoint and cascade are not in SYSTEM, DB or API design yet. They are needed before M4. **Open.**

## 2026-10-03 — Slice 1b (part 2): sign-up page, signed-in placeholder, sign-out

- **`/signup`** replaces the coming-soon page. It follows the Stitch "Create Account" screen (landing tokens, light and dark), with the "Peace of mind for the family" panel.
  - Client checks use the shared `signupSchema`; `NAME_MAX` is now exported next to `PASSWORD_MIN`/`MAX`.
  - Server errors are shown by code:
    - `EMAIL_TAKEN` → under the email field, with a "Sign in instead" link.
    - `VALIDATION_ERROR` with `fields.password` → "This password is too common". That rule exists only on the server.
    - Anything else → the shared banner.
  - The coming-soon component and its copy are removed.
- **`/onboarding`** is a placeholder for slice 2's "create or join a wedding". It is a server component that resolves the session through `(members)/_lib/current-user.ts`, the same `resolveSession` the route handlers use. Without a session it redirects to `/login`. It shows the user's name and email, with a **Sign out** button that calls `POST /api/auth/logout` and returns to `/login`.
- **Copy guardrail** (`tests/content/landing-copy.test.ts`) now also checks the `auth` messages, because the side panels repeat landing-page promises.
- **Session cookie in local dev:** `Secure` is left off only for `next dev` on a plain-http origin, so Safari and `127.0.0.1` can sign in. This deliberately differs from API_DESIGN §2.1, for development only.
- **Env and connection:** `MONGODB_URI` must name its database. Without one, the driver silently used `test`. In development, `env()` re-reads `process.env`, and `connectDb()` reconnects when the URI changes. Before this, `next dev` kept the connection cached on `globalThis` with the old URI, so new users still went to `test` after `.env.local` was fixed. Production behaviour is unchanged.

**Verification:**
- lint, format, typecheck, unit + integration tests (117) and build pass.
- 52 e2e tests pass (landing, login, signup) on mobile and desktop. The new `signup.spec.ts` stubs the API for field checks, EMAIL_TAKEN, the common password, the rate limit and success.
- Manually against the Atlas dev cluster: sign-up → `/onboarding` shows the name → Sign out clears the `sid` cookie → `/onboarding` redirects to `/login` → sign-in returns to `/onboarding`.

### Known gaps
1. **Signed-in users can still open `/login` and `/signup`.** Redirect them once slice 2 knows where to send them. **Closed** 2026-10-03 (next entry).
2. **Server components cannot re-send the sliding session cookie.** The next API call refreshes it. **Verify** once `/app` pages make few API calls.

## 2026-10-03 — Migration runner, auth indexes in dev, sign-in polish

A manual browser test of the auth flow found that **a second sign-up with the same email succeeded**. The Atlas dev database had no indexes on `users` or `sessions` (only `_id`), so the unique email index that signup relies on for `EMAIL_TAKEN` did not exist. Login's `findOne` then picks an arbitrary one of the duplicates, and expired sessions were never TTL-deleted. Likely cause: Mongoose `autoIndex` builds a model's indexes once per process, and the dev reconnect-on-URI-change (previous entry) left the newly selected database without them. Production never relies on `autoIndex` (§17.2), so it needs the migration runner anyway.

- **Runner** (`migrations/runner.ts`, DATABASE_DESIGN §17.1): applies registered migrations in order and records each in `schema_migrations` only after `up` succeeds, so a failed one is retried. Migrations are listed by hand in `MIGRATIONS`; `tests/db/migrations.test.ts` fails if a numbered file is not registered.
- **`pnpm db:migrate`** (`scripts/migrate.ts`): plain Node with type stripping (Node 22.18+/24, no new dependency), reading `.env.local` if present. It cannot import `src/server` because of `server-only`. It refuses a database that looks like production (`NODE_ENV=production` or a name containing `prod`) unless `--production` is passed. `tsconfig.json` gains `allowImportingTsExtensions` for the `.ts` import specifiers Node needs.
- **Dev database:** deleted the four duplicate QA test users from the manual test (and their sessions), then ran `0001_auth_indexes`. `users.email` is unique; `sessions` has `tokenHash` unique, `userId`, and the `expiresAt` TTL; `rate_limits` has its TTL.
- **Signed-in users** opening `/login` or `/signup` are redirected to `afterSignInPath` (`(auth)/_lib/redirect-if-signed-in.ts`). Not applied in the `(auth)` layout, because `/join/[token]` and `/reset-password` make sense while signed in. `currentUser` moved to `src/app/_lib/current-user.ts` so both route groups share it.
- **Focus:** after a failed client check or a server field error (`EMAIL_TAKEN`, common password), focus moves to the first invalid field (`useFocusFirstInvalid`). After `INVALID_CREDENTIALS`, the email is kept and the password is cleared and focused.

**Verification:**
- lint, format, typecheck, unit + integration tests (131) and build pass. New: runner integration tests (indexes created, re-run is a no-op, duplicate email rejected, a failed migration is not recorded and is retried), registry test, redirect unit test.
- 58 e2e tests pass on mobile and desktop, three repeats for login/signup. The "goes to onboarding" signup test was flaky: the stub sets no cookie, so `/onboarding` bounces to `/login` before the URL could be read. It now waits for the `/onboarding` request.
- Manually against the Atlas dev cluster (Playwright Chromium): duplicate signup → 409 with focus on email; signed-in `/login` and `/signup` → `/onboarding`; wrong password clears and focuses the field; sign-in works.

### Known gaps
1. **CI e2e uses a standalone `mongo:8` and no `SESSION_SECRET`,** so no e2e test can create a real session (transactions need a replica set). Real-session flows are covered by integration tests and manual runs only. **Open.**
2. **Integration tests still get indexes from `autoIndex`,** not from the migrations. Running migrations in the test global setup would match production. **Open.**
3. **Run `pnpm db:migrate` against each new environment** (Vercel previews' database, production at go-live, slice 8) before deploying code that depends on it. **Open.**

---

## 2026-10-04 — Slice 2: create wedding, app shell, dashboard

From the Stitch screens "Create your wedding" (desktop + mobile) and "Wedding Dashboard" (new, in progress, mobile), recoloured to the landing tokens, and wired to real data.

**Product decisions (2026-10-04), written into the docs:**
- **Name order** is the couple's choice, bride first by default: new `weddings.nameOrder` (`BRIDE_FIRST` | `GROOM_FIRST`) in PRD §9.2, DATABASE_DESIGN §5.4 and API §11. It sets the order everywhere both names appear, the website slug (SYSTEM §27) and the delete confirmation text. `lib/couple.ts` `coupleNames()` is the only place that orders names.
- **Wedding date must be today or later** in the wedding's timezone (PRD §9.2, API §11), on create and on any later date change. Today is allowed, for families who sign up on the day.

**Data and API:**
- `modules/weddings`: `wedding.model.ts` (§5.4: embedded website, gallery, counters, uploadStats; gallery token `select: false`; not tenant-guarded, always addressed by `_id` + `status: 'ACTIVE'`), `slug.ts`, `wedding.service.ts`, `mapper.ts` (fields picked one by one so the gallery token, counters and status never leak), `schemas.ts`.
- `modules/members`: `membership.model.ts` (§5.5, tenant-guarded, unique `userId`) and `addMember()`.
- `POST /api/wedding` (withUser): one transaction inserts the wedding and the first Admin membership (§8). The unique `userId` index decides ALREADY_MEMBER, so concurrent creates leave one wedding. Slug: names in display order + 6-char `[a-z0-9]` suffix from `crypto.randomInt`, retried on collision. Gallery token: 128-bit base64url.
- `GET /api/wedding` (withMember). `withMember` (API §3.2) lives in `modules/weddings`: membership via `unscoped.ts` lookup 1 (`findMembershipByUserId`), then the ACTIVE wedding; none → 403 NO_WEDDING; Admin-only routes → FORBIDDEN.
- `GET /api/me` and `POST /api/auth/login` now include `membership` and `wedding` (with `nameOrder`), so sign-in lands on `/app` when there is a wedding.
- `modules/dashboard` `getDashboard(ctx)`: real days-to-go; every other number is 0 until its module exists (no `GET /api/dashboard` route yet, the page calls the service, API-08). `isWeddingEmpty()` is always true for the same reason.
- Migration `0002_wedding_indexes` (weddings slug/token unique, status, weddingDate; memberships userId unique, weddingId+role). **Applied to the Atlas dev database.**

**Pages:**
- `/onboarding`: the create form (bride, groom, name order, date, city required; venue, title, short note optional) with a live preview that follows the name order and shows days to go. Client checks use the shared schema; a server date error (clocks disagree) shows on the date field. Signed out → `/login`; already in a wedding → `/app`.
- `/app` layout: signed out → `/login`, no wedding → `/onboarding`. Shell (`src/components/app-shell`): sidebar with the couple's names and date, all PRD §10 sections (unbuilt ones 404), settings, member name, role and sign-out; on phones a top bar and a `<dialog>` menu. Nav items are looked up in the client component by group name, because icon components cannot cross from a server component.
- Dashboard: countdown band (today and past states), "Get started" while there are no events or guests, six summary cards, upcoming events and tasks with empty states. Components are already built for filled data (seen with sample data during design).
- `app/_lib/current-member.ts`: the server-component version of `withMember`, cached per request.
- Shared: `lib/dates.ts` (`todayIn`, `hourIn`, `daysBetween`, `addDays`, `isCalendarDate`, day-first `en-IN` dates, 12-hour times; all UTC-safe), `lib/money.ts`, `textareaClasses`, a `danger` badge tone, `--text-countdown`, 12 icons, `SignOutButton` variants. ESLint and Prettier ignore `.claude/` (other sessions' worktrees broke `pnpm lint`).

**Review fixes (same day, from testing):**
- **Errors clear on edit:** `useFieldErrors` (replaces `useFocusFirstInvalid`) is shared by login, signup and create wedding. Editing a field removes its error immediately; focus moves to the first invalid field only after a submit, so typing never jumps the cursor.
- **Unbuilt sections:** `app/[...section]/page.tsx` shows "Coming soon" inside the shell for any nav section (and its sub-paths, e.g. `/app/settings/members`); other paths still 404. Real pages take precedence as each slice lands.
- **Date picker** has `min` = today in `Asia/Kolkata`; the schema stays the real guard.
- **City and state** are separate fields (state optional, `location.state`); the city placeholder is just "e.g. Dehradun". `formattedAddress` = venue, city, state.
- **Sidebar couple card** wraps long names instead of cutting each one off; the full names are in `title`.

**Verification:**
- lint, format, typecheck, 165 unit + integration tests, build, 60 e2e tests pass (new: errors clear on edit).
- New `tests/security/wedding.int.test.ts` (own database): 401 without a session; creates wedding + ADMIN membership; no gallery token, slug, counters or status in the response; name order sets slug and response; ALREADY_MEMBER on a second create; two concurrent creates leave one wedding; past date, unknown and server-owned fields → 400 and nothing written; today accepted; NO_WEDDING without membership; each member sees only their own wedding; DELETING counts as no wedding; `/api/me` and login include the wedding; memberships are tenant-guarded. Migration tests cover 0002.
- Manually on `pnpm dev` + Atlas dev (Playwright, throwaway `design-preview-*@example.com` accounts): signup → `/onboarding`; `/app` without a wedding → `/onboarding`; past date error; groom-first create → `/app` shows "Akshay & Princi" and 133 days; `/onboarding` with a wedding → `/app`; sign out and sign in → `/app`; phone layout and menu; dark mode.
- Manual run in Google Chrome after the review fixes (2026-10-04, throwaway `wed-qa+*@example.com` accounts): field errors clear on edit (signup and onboarding); date picker `min` is today; city and state stored separately; long names wrap in the sidebar and countdown card; `/app/events` shows "Coming soon" inside the shell, unknown `/app/*` paths 404; HTML in names renders as text; double-click sends one POST. **DELETING guard:** with a test wedding set to `DELETING` in the dev database, sign-in lands on `/onboarding` and submitting shows the generic error with a reference and re-enables the button (POST 409, then `/api/me` without a wedding), no loop. A second tab submitting after the first created the wedding still goes to `/app`.
- **Flaky rate-limit tests fixed:** `tests/security/auth.int.test.ts` "login is rate limited per email" failed about one run in five. The limiter counts in fixed windows aligned to the clock (15 minutes, 1 hour), so a test running across a boundary split its 11 attempts between two counters. The login and signup limit tests now pin `Date` one minute into a fresh hour (`vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true })`).

**Design alignment:** left out Stitch copy and features the PRD does not have: the ceremonies line on the preview, "Planning in progress" / "Wedding space initialized" pills, "Bespeak", the footer tagline, "all confirmed" vendors, completed tasks in the upcoming list, the avatar button. Cover image (optional) waits for R2 (M2).

### Known gaps
1. **No e2e for onboarding or `/app`:** they need a real session, which CI e2e cannot create (gap 1 of the 2026-10-03 entry). Covered by the security integration tests and the manual run. **Open.**
2. **Slug transliteration:** names in Devanagari or Gurmukhi fall back to `wedding-xxxxxx`; SYSTEM §27 asks to transliterate. **Open.**
3. **Places autocomplete** for the city (lat/lng, place id) comes later; city and venue are free text. **Open.**
4. **`GET /api/dashboard` route** not added yet; the page uses the service directly. Add it with its first client consumer. **Open.**
5. **Run `pnpm db:migrate`** on every other environment before this ships (0002 holds the one-wedding rule). **Open.**
6. **A user whose wedding is DELETING** still has a membership until §14.8 step 3 runs (after R2, so up to a day if the request fails and the daily job resumes). Creating a new wedding then returns ALREADY_MEMBER, which the form used to treat as success, and `/app` sent the user straight back: a silent loop. **Guarded** 2026-10-04: on ALREADY_MEMBER the form asks `GET /api/me` (new `getJson` in `lib/api.ts`) and goes to `/app` only if a wedding is returned; otherwise it shows the generic error with the request id. **Real fix in slice 13:** delete the memberships in step 1, in the same transaction that sets `DELETING` (update DATABASE_DESIGN §14.8 first). Cannot happen yet: nothing sets `DELETING`. **Open.**

---

## 2026-10-04 — Settings → Wedding details (edit the wedding)

From the Stitch screen "Wedding Details Settings" (`f5d4f6926afd4572a21b9f46fd6baf7f`, desktop), recoloured to the tokens; phone and dark layouts follow the existing design system. Done before slice 3 because the create form promises "You can change any of this later".

- **`PATCH /api/wedding`** (withMember, any member: API §9 marks it `M`). `updateWeddingSchema` is strict: omitted fields are unchanged, `null` (or blank) clears `title`, `description`, `rsvpDeadline`, and `timezone`, status, website, gallery and counters are rejected as unknown fields. One targeted `findOneAndUpdate` with `$set`/`$unset` (never null stored). A sent `location` replaces the place: state, lat/lng and place id are dropped when not sent, but `country` is kept unless sent. The settings form sends only changed fields (`weddingChanges`), and the location only when venue, city or state changed, so a title-only save never touches the stored location (review fix: every save used to resend it and erase the `India` default). The slug never changes (SYSTEM §27). A new `weddingDate` must be today or later in the wedding's stored timezone; resending the saved date is allowed, so other fields stay editable after the wedding day. No activity entry: wedding edits are not in the §5.15 action list.
- **Shared form:** `(members)/_components/wedding-form.tsx` holds the fields, the client check (`useCheckWeddingForm`, same rules as the server via `weddingFieldsSchema` + `isPastWeddingDate`) and the preview panel; `/onboarding` was rebuilt on it (now controlled inputs). Messages moved to `members.weddingForm`.
- **Venue:** stored only inside `formattedAddress` ("venue, city, state"); `splitVenue()` recovers it for editing, and an address that does not end in city/state is shown whole.
- **`/app/settings`:** title + tabs (Wedding details · Members · Activity log · Danger zone; the last three Admin-only and hidden from Managers). Wedding details card with Save (enabled only when something changed), Discard, a "Saved" status until the next edit, the website-address note, and the sticky live preview from `lg`. Saving refreshes the server components, so the sidebar, header and dashboard show the new names, order and date. `/app/settings/[...rest]` shows "Coming soon" for the other tabs (404 for Managers and unknown paths); `ComingSoon` is now shared with `/app/[...section]`.
- `lib/api.ts` gains `patchJson`.
- **Unsaved changes** (review fix): `useUnsavedChangesWarning` (`components/ui`) asks "Leave this page without saving them?" while the form has edits. In-app links are checked in a document-level capture listener, so every link (sidebar, logo, tabs) is covered without wiring Next's per-link `onNavigate`; reload and closing the tab use the browser's `beforeunload` prompt. New-tab clicks and same-page links are ignored.
- **Phone tab strip** (review fix): the settings tabs scroll sideways with a fade on whichever edge hides tabs, and the current tab is scrolled into view (Danger zone was showing as "Dan…").
- Left out of the Stitch screen: the top bar (location, search, notifications, avatar) and the ceremonies line on the preview (not in the PRD). Not on the form yet: RSVP deadline (slice 5), cover image (M2).

**Verification:**
- lint, format, typecheck, 182 unit + integration tests, build, 60 e2e pass.
- `tests/security/wedding.int.test.ts` adds 9 PATCH tests: 401 / NO_WEDDING; edits only the caller's wedding and keeps the slug; a Manager can edit; `null` clears and the field is absent in storage; a replaced location drops old place details but keeps the country; a save without location leaves it untouched; past date rejected but an unchanged past date with another edit accepted; server-owned and non-editable fields → 400 with nothing written; foreign Origin → 403. Unit tests for the PATCH schema, `joinAddress`/`splitVenue`, `weddingChanges` and `patchJson`.
- Manually with Playwright against `pnpm dev` on a local in-memory replica set (the Atlas dev cluster refused the connection: IP not on the access list): prefill incl. venue split; Save disabled until an edit; rename + groom-first + clear title + new venue → "Saved", sidebar shows "Akshay ♥ Meera"; reload keeps it; past date error; Discard restores; `/app/settings/members` "Coming soon"; unknown settings path 404; dark and Pixel 7 layouts.

### Known gaps
1. **No e2e** for settings (needs a real session, as for slice 2). **Open.**
2. **Atlas dev access list:** the IP was briefly not allowed during this work. **Closed** (reachable again the same day).
3. **Browser back/forward** inside the app is not intercepted by the unsaved-changes warning: the App Router has no supported way to block it. **Open.**

---

## 2026-10-04 — Slice 3: Events

From the Stitch screens "Events List" (`e2cd067725414916b9cbdcc97a0c669d`), "Add Event" (`1dc1dcaf8eff4f9ca0ea0b0e2e1e4fd9`) and "Delete Event Confirmation" (`7b01bfd187d449efad8a3ac0ecaa9133`), desktop; phone and dark follow the design system.

**API (API_DESIGN §13), all `withMember`, any member:**
- `GET/POST /api/events`, `GET/PATCH/DELETE /api/events/:id`, `GET /api/events/:id/delete-preview`. Path ids that are malformed or belong to another wedding are the same 404 (§3.3); `server/db/ids.ts` `toObjectId`. Dynamic routes read `RouteContext` params and wrap `handler`/`withMember` per call.
- `createEventSchema` / `updateEventSchema` (strict; PATCH omitted = unchanged, `null` clears; the venue is replaced whole and a venue with no parts is stored absent). Map links must be http(s), so a `javascript:` link can never reach a guest's invitation. Limits from DB §1.12/§5.7. 30 events per wedding, soft check-then-insert (DB §15) → `409 LIMIT_REACHED { limit: 30 }`.
- Sort: date, then start time (no time first), then `_id`.
- Delete: one transaction deletes the event and appends `event.deleted` (meta `affectedGuests`, `leftWithNoEvents`) (DB §8, §14.1). `assertSameOrigin` (split out of `readJson`) guards the body-less DELETE.
- **Not real yet:** `headcount` is `{0,0}`, delete-preview counts are 0 and the guest/task/expense/vendor/photo cascades are not in the transaction: those collections do not exist. Each joins the service with its slice (guests in slice 4).

**Activity log (`modules/activity`):** `activity_logs` model (§5.15) with the doc's action list, tenant-guarded, and append-only: every update/delete through the model throws `AppendOnlyError`. `recordActivity(session, entry)` writes inside the caller's transaction.

**UI:**
- `/app/events`: summary line, Add event (hidden at 30), cards with date tile (sandalwood for the next ceremony), type pill when the name differs, "Next ceremony", "Wedding day" (event date = wedding date) and "Done" (past) pills, time range or "Time to be announced", venue or "Venue to be announced", dress code, confirmed count (desktop), "⋯" menu (Edit, Delete). Empty state.
- Delete: a native `<dialog>` loads `delete-preview`, then says who loses the event (copy ready for guests), "This can't be undone", red Delete (new `danger` button). A 404 on delete (already gone) also closes and refreshes.
- `/app/events/new` and `/app/events/[id]`: type chips (picking one fills the name until the user types their own), name, date, start/end time (end before start = next day, with a hint), venue name, address, map link, dress code, description; live guest-invitation preview with "Open in Maps"; unsaved-changes warning; edit sends only changed fields (`updateEventBody`).
- Dashboard: events card and "Upcoming events" now use real data (`eventSummary`: count + next 3 from today). Get-started and empty-state CTAs go to `/app/events/new`.
- Left out of Stitch: "Multi-day itinerary management", "Guest stationery view", the "Order of ceremonies automatically syncs…" note (not in the PRD). Cover image waits for R2 (M2).
- `lib/dates.ts` `formatTimeRange`; `lib/api.ts` `deleteJson`; icons More, Plus, ArrowLeft, ExternalLink.

**Review fixes (same day), with product decisions written into PRD §9.5, API §13 and DB §5.7:**
- **Times:** an end time needs a start time and must differ from it (an earlier end is still "next day"). `eventTimeProblem` is shared by `createEventSchema`, the service (PATCH checks the stored values merged with the change, so clearing only the start is refused) and the form (the end-time input is disabled until a start is set, and clearing the start clears the end).
- **Date range (owner decision, option A):** no earliest date (past events like a roka are fine); latest = one year after the wedding date (`latestEventDate`, `addYears` clamps 29 Feb). Checked on create and when the date changes, never on other edits, so moving the wedding date later never strands existing events. The form sets `max` on the date input. `MemberCtx` now carries `wedding: { weddingDate, timezone }` from the membership lookup, so the service needs no extra read.
- **At the limit:** `/app/events/new` shows the "already has 30 events" notice and disables Save (`countEvents`); the server check stays.
- **`isEmpty`:** `isWeddingEmpty(weddingId)` now returns false when the wedding has events (`hasEvents` from the events module). It had been left at `true` from slice 2, so a wedding with events reported `isEmpty: true`, which slice 13 would have trusted to skip the name confirmation. The function's comment now says every new collection must add its check there; STATUS lists it for slice 4.
- The architecture lint test gets a 30 s timeout: loading ESLint takes about 7 s when the whole suite runs in parallel, which tripped the 5 s default.

**Data:** migration `0003_event_and_activity_indexes` (events `{weddingId, date, startTime}`, activity `{weddingId, createdAt -1, _id -1}`). **Applied to the Atlas dev database.**

**Verification:**
- lint, format, typecheck, 204 unit + integration tests, build pass; e2e 58 of 60 locally (the two health-check smoke tests fail only because the Atlas dev cluster was unreachable from this machine at the time).
- `tests/security/events.int.test.ts` (own database), using the new `tests/factories/api.ts`: 401 / NO_WEDDING; create + sort order; another wedding's event → 404 on read, edit, preview and delete, and unchanged; malformed ids → 404; server-owned fields, unknown type, `javascript:`/`data:` map links, bad time/date → 400 with nothing written; 30-event limit; PATCH null clears and blank venue is removed; delete writes `event.deleted` in the same transaction and a second delete is 404; foreign Origin on POST and DELETE → 403; events and activity logs tenant-guarded, activity append-only; time rules on create and PATCH (end without start, equal times, clearing only the start), date range (a year after the wedding is the latest, any earlier date allowed, the rule applies only when the date changes). Migration test covers 0003. Unit tests for `formatTimeRange` and the form bodies.
- Manually on `pnpm dev` + Atlas dev (throwaway `design-preview-*` accounts): empty state; Haldi chip fills the name; date and `javascript:` map-link errors, cleared on edit; save → list; list with past (Done), next, wedding-day pills and an overnight sangeet; edit via menu; delete via dialog (204, list refreshes); unknown id 404; dashboard shows the count; dark and Pixel 7.

### Known gaps
1. **Guests cascade, headcount and delete-preview counts** land with slice 4. **Closed** (2026-10-05).
2. **No e2e** for these pages (need a real session). **Open.**
3. **Review fixes not checked in a browser:** the Atlas dev cluster refused connections (IP access list) while they were made; they are covered by unit and integration tests. Check the end-time behaviour, the date `max` and the at-limit notice by hand. **Verify.**

---

## 2026-10-05 — Slice 4: Guests

Guest management (PRD §9.7–9.9, API_DESIGN §14, DATABASE_DESIGN §5.8, §10, §13, §14). Built from the Stitch screens "Guests List", "Guests (Empty State)", "Add Guest" and "Guest Detail & Delete Confirmation".

- **Module `modules/guests`:** `guest.model.ts` (tenant-guarded; `inviteLink.token` is `select: false`; every write `$inc`s `version`), `schemas.ts` (create/update/member-RSVP/list-query schemas shared by routes, pages and forms), `mapper.ts` (`invitedEvents` → `invitedEventIds`, `inviteLink.firstOpenedAt` → `linkOpenedAt`; only `toGuestDetail` adds `inviteUrl`), `guest.service.ts`.
- **Endpoints:** `GET/POST /api/guests`, `GET/PATCH/DELETE /api/guests/:id`, `PATCH /api/guests/:id/rsvp`, `POST /api/guests/:id/regenerate-link`. The two member-side items that the roadmap had under slice 5b (member RSVP edit, regenerate link) are here because they are guest endpoints with nothing guest-facing.
- **List:** cursor pagination by name, case-insensitive (collation `en`/2 on the query and the `{ weddingId, name }` index; DB §5.8 updated), `_id` tiebreak. The cursor carries a hash of the filters, so a cursor from another filter combination is `400` (API §5.2). Search is a case-insensitive name prefix (regex-escaped) or, with 3+ digits, digits contained in the phone. Filters: side, event, RSVP, sent, opened, no events. The page reads the same parameters from its URL (`guestListQueryInput`), so filters survive reload and back.
- **Writes:** create checks the soft 1,000 limit and every `invitedEventIds` entry (`assertEventsExist` in the events module, 404 with `details.field`), generates a 128-bit token (`newLinkToken`), and writes `guest.created` in the same transaction. PATCH is last-write-wins with `$set`/`$unset`; lowering `maxPeople` below the confirmed count fails in the update filter (`BELOW_CONFIRMED`); `guest.updated` logs `changes`. Member RSVP carries `expectedVersion` and the capacity in the filter (`VERSION_CONFLICT` with `details.current`, `CAPACITY_EXCEEDED`); `PENDING` clears `respondedAt/Via`. Regenerate replaces the token and clears `firstOpenedAt` and `delivery`. Delete is a transaction with `guest.deleted` (email-job cancel joins with slice 11).
- **Phones:** `lib/phone.ts` `normalizePhone` (any common Indian format, `00`/`+` international; 10 digits default to +91) and `formatPhone` (`+91 98112 34567`).
- **Events now read guests:** real `headcount` (DB §13.2) on list, detail and dashboard; delete preview counts and names (§14.1); the delete transaction `$pull`s the event from guests and logs `{ affectedGuests, leftWithNoEvents }`. RSVPs are left alone.
- **Module dependency:** guests → events (`assertEventsExist`) and events → guests (headcount, preview, cascade) import each other through their `index.ts`. Both only call each other inside functions, so the cycle is safe at load time; tasks, expenses and photos will need the same pair with events.
- **Wedding and dashboard:** `isWeddingEmpty` also checks `hasGuests`; the dashboard guest numbers come from `guestSummary` (DB §13.1: guests with no events are left out and counted apart).
- **Pages:** `/app/guests` (stats strip, "not invited to any event" flag, URL-driven filters with removable chips, table from tablet width and cards on phones, "Load more"), `/app/guests/new` and `/[id]/edit` (shared `GuestForm` with live invitation preview, side with Clear, +91 phone adornment, 1–20 stepper, event checklist with Select all, current RSVP shown beside the events when editing), `/app/guests/[id]` (details, invited events, RSVP card with inline editor, invitation link card with copy and regenerate confirm, delete dialog).
- **Left out of Stitch (not in V1 or later slices):** Import CSV (slice 12), Resend/WhatsApp itinerary and "Send Email Confirmation" (slices 6, 11), "Export RSVP card", a guest ID like `SH-8291`, a separate dietary field (notes cover it), the open count ("4 times": only the first open is stored).
- Icons: Search, Refresh, Eye, Pencil, Minus. `server/http/route.ts` `parseWith` (the Zod → 400 mapping, now shared by `readJson` and query parsing).
- Product rule written into PRD §9.8: when the wedding has events, the add-guest form needs at least one.

**Data:** migration `0004_guest_indexes` (unique token; `{weddingId, name}` with collation; `{weddingId, invitedEvents.eventId}`; `{weddingId, phone}`). **Applied to the Atlas dev database.**

**Verification:**
- lint, format, typecheck, 251 unit + integration tests, build pass.
- `tests/security/guests.int.test.ts` (own database, 20 tests): 401 / NO_WEDDING; create normalises phone and email, dedupes events, returns a 22-character token and logs `guest.created`; token `select: false` and absent from lists; server-owned fields, bad phone/email, `maxPeople` 0/21 → 400; another wedding's event → 404 `invitedEventIds` on create and PATCH; another wedding's guest → 404 on read, PATCH, RSVP, regenerate and delete, and unchanged; malformed id 404; case-insensitive paging without skips or repeats; foreign and forged cursors 400; every filter including regex characters in search; PATCH null clears with logged `changes`; `BELOW_CONFIRMED`; RSVP capacity, version conflict and PENDING reset; regenerate clears sent/opened; delete + second delete 404; foreign Origin 403 on every mutation; 1,000 limit; tenant guard on find and aggregate; headcount, delete preview and cascade with `leftWithNoEvents`; dashboard numbers excluding a guest left with no events; `isEmpty` false with a guest. Migration test covers 0004. Unit tests for `normalizePhone`/`formatPhone` and the form bodies.
- Headless Chromium (Playwright) against `pnpm dev` + Atlas dev with a throwaway `guest-check-*` account: empty state, list with stats and the no-events flag, filter by side, add form errors and filled preview, save → detail, RSVP edit → saved, delete dialog, edit with current RSVP, phone layout (390 px), events page headcounts. Fixed from it: the people stepper stretched full width; phone cards showed "—" for no side; the edit form showed the raw E.164 phone. The Chrome extension was not connected, so nothing was checked by hand in a real browser.

### Known gaps
1. **No e2e** for these pages (need a real session). **Open.**
2. **Guest-facing invitation page** (`/invite/[token]`) does not exist yet: links 404 until slice 5. **Open.**
3. **Email-job cancel on guest delete** joins the delete transaction with slice 11. **Open.**
4. **Repeatable filters** (`side`, `rsvpStatus`) are supported by the API, but the page's menus pick one value each. **Open (by choice).**

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

## 2026-10-05 — Slice 4 merged

- Merged `feat/guests` into `dev` (--no-ff). Fix from testing: the guest table's row menu was clipped by the card's `overflow-hidden`; the card no longer clips and the header rounds its own corners.
- `/invite/[token]` still 404s by design until slice 5.

## 2026-10-05 — Slice 5: Invitation page + RSVP (guest side)

- **Lookup 3** (`findGuestByInviteToken` in `server/db/unscoped.ts`): guests by `inviteLink.token`, ids only. Tokens that aren't 22-char base64url skip the DB. After it, everything is scoped by the guest's `weddingId`; the wedding must be `ACTIVE`.
- **New module `invitations`**: composes `weddings.findInvitationWedding`, `guests.findInvitationGuest / markInvitationOpened / submitLinkRsvp`, `events.invitationEvents`. The token is in every guest filter, so a link regenerated mid-request is not found.
- **API**: `GET /api/public/invite/:token` (IP 120/min) and `POST …/rsvp` (per-invitation 20/15 min, global 300/min). `X-Robots-Tag` and `Referrer-Policy: no-referrer` via `server/http/public.ts`. Bad, regenerated, deleted-guest and DELETING-wedding links get the identical 404.
- **Doc fix**: API §24 `wedding` now includes `nameOrder`, needed for the couple-name rule (PRD §9.2).
- **Guest RSVP is not activity-logged**: `actor` requires a member `userId`. Single `updateOne` with capacity + token in the filter (DB §10).
- **Page** `/invite/[token]`: server component plus one client island (`RsvpForm`). `React.cache` shares one load between metadata and page. Rendering never marks the link opened (see below). The form re-reads the GET endpoint when the tab becomes visible. The page applies the GET IP limit too; over the limit it shows not-found.
- **Settings**: new "RSVP deadline" card (`PATCH /api/wedding { rsvpDeadline }`, null clears). Deadline day itself is still open.
- **Stitch** screens `9b501c87…` (RSVP), `9f162923…` (confirmed), `bdf71d3c…` (deadline passed). Left out invented content: Barat/Pheras sub-times, family signature line, "rosters finalized with the venue" copy, footer.
- **Review follow-ups (same day, docs first):**
  - *Deadline rule* (PRD §9.11, API §11, DB `weddings.rsvpDeadline`): today or later when set, on or before the wedding date; a wedding date earlier than the deadline is refused. Checked in `updateWedding` and again in the update filter (the other date can change concurrently). Client checks in the deadline card (`min`/`max` too) and the details form.
  - *`Cache-Control: no-store`* on `/invite/:token` via `next.config.ts` `headers()` (with `X-Robots-Tag`, `Referrer-Policy`). Next's dynamic-page default was `no-cache, must-revalidate`. Verified on `next start`.
  - *Opened by a real browser only* (API §24, DB §5.8): new `POST /api/public/invite/:token/opened` (empty JSON, same-origin, shares the GET IP limit, 204). `OpenedBeacon` client component sends it after hydration. Preview bots don't run scripts, so they no longer mark links opened.
- **Open**: `welcomeMessage` has no editor until the website slice, so it is usually absent. `NextIntlClientProvider` ships all messages to guest pages (budget-phone weight; revisit).

## 2026-10-06 — Slice 6: WhatsApp share + mark sent

- **Docs first:** PRD §9.14 now has the message copy ("Dear {guest}, {name 1} & {name 2} would love for you to celebrate their wedding with them. Please see the details and reply here: {link}", English only, couple order via `coupleNames`), Mark as sent, and "not logged" (also under Logged Actions). API §16 and DB `guests.delivery`: first one wins; only regenerate clears it.
- **API** `POST /api/guests/:id/mark-sent { via: 'WHATSAPP' | 'MANUAL' }` → 200 `Guest`. One `findOneAndUpdate` with `delivery: { $exists: false }` in the filter and `$inc: { version: 1 }` (DB: every write bumps version); no match → re-read: found returns it unchanged (including an `EMAIL` delivery), missing → 404. No transaction, no activity entry. `EMAIL` is rejected (400): only the email paths set it.
- **UI:** `lib/whatsapp.ts` `whatsAppUrl(phone?, text)` builds `wa.me/<digits>?text=…` or `wa.me/?text=…`. Detail invitation card: message preview, Share on WhatsApp (a real `<a target=_blank>`; the first tap calls mark-sent, later taps only open), "Already sent it another way? Mark as sent", channel + date in the status row; `router.refresh()` keeps the RSVP card's version in step. Row menu (list only): Share fetches `GET /api/guests/:id` for the link (lists never carry it) after opening the tab inside the click, so popup blockers allow it; Mark as sent hidden once sent; errors in a small bubble. List Invite column shows the channel.
- **Stitch** `c6e50d1c…` (detail card, both states), `6d58eb58…` (row menu). Left out: guest ID `G-7824`, "concierge note" label, diet/lodging fields, "Invitations & RSVPs" nav item.
- **Tests:** `tests/security/mark-sent.int.test.ts` (own DB, 8): 401/NO_WEDDING, sets sentAt/sentVia + version, no activity entry, repeat by either channel unchanged, EMAIL kept, regenerate then re-mark, 400 for EMAIL/unknown/extra/missing body, foreign/malformed/unknown id 404 unchanged, foreign Origin 403. `whatsAppUrl` unit tests (3). 272 tests total.
- **Open:** DB §11 still says a successful email always sets `delivery` to EMAIL; slice 11 decides whether email also follows first-one-wins.

## 2026-10-11 — Slice 10: Wedding members (invite, join, roles, last-admin)

- **Order:** built before slices 7–9 at the product owner's request; email is the minimal Resend adapter, not the slice 9 email foundation (no `email_jobs` queue, no daily allowance, no `EMAIL_QUOTA_EXHAUSTED` yet: slice 11 adds the quota).
- **Docs first:** API §12 create and resend now return `MemberInvitation & { joinUrl, emailSent }`. The link is returned only by those two calls (never stored in plain text, never listed) so the Admin can also share it on WhatsApp or copy it (PRD §9.4 "user decides"). A failed or unconfigured email still creates the invitation, with `emailSent: false`.
- **Email:** `src/server/email/email.ts` `sendEmail` (the only Resend import), never throws, logs only `kind` and the error class. `emailEnv()` reads `RESEND_API_KEY` + `EMAIL_FROM` on use; missing → skipped. Integration tests delete the key in global setup. Copy in `messages/en.json` `emails.memberInvitation` via `createTranslator`; HTML escapes names.
- **Data:** `member_invitations` model (DB §5.6, tenant-guarded, `tokenHash` select:false), migration `0005_member_invitation_indexes` (unique `tokenHash`, partial-unique pending `{weddingId, email}`, `{weddingId, status}`). Unscoped lookup #2 `findMemberInvitationByTokenHash` (already listed in DB §6.3). Token = `newToken()` (256-bit), HMAC stored, 7 days.
- **API:** `GET /api/members` (any member); `PATCH`/`DELETE /api/members/:userId`, `GET`/`POST /api/member-invitations`, `/:id/resend`, `/:id/revoke` (Admin); `POST /api/member-invitations/accept` (signed in); `GET /api/public/member-invitations/:token` (§26, same 404 for unknown/revoked/accepted/malformed). `POST /api/auth/signup` takes `memberInviteToken`: joining runs inside the signup transaction through a `join` hook (the route composes auth + members, so no auth↔members import cycle); mismatch → no account.
- **Rules:** role changes and Admin removal move `counters.adminCount` in the same transaction (`changeAdminCount`, DB §9.2) → `LAST_ADMIN`; concurrent mutual demotion tested. 25 = members + unexpired pending invitations. An expired pending invitation for the same email is renewed in place (the partial index allows one). Invite/resend share the 20/day/wedding limit (API §7). Accept: pending + unexpired in the update filter, then membership insert (unique `userId` = one wedding). `ALREADY_MEMBER.details.currentWeddingIsEmpty` is returned.
- **Activity:** `member.invited`, `member.joined`, `member.role_changed`, `member.removed`. Label edits, resend and revoke are not logged (no action in DB §5.15).
- **UI:** Settings → Members (Admin only; Managers 404 like before): member rows with role/label badges, ⋯ menu (change role, edit label, remove) with inline editor and remove dialog; pending invitations with resend/revoke; invite dialog (email, Admin/Manager cards, label) → "Invitation ready" view: email status, **Share on WhatsApp** (`wa.me/?text=`), copy link, "shown only now" note. `/join/[token]` (auth shell): create account and join (email locked), log in to join (`/login?next=/join/…`, only `/join/<token>` allowed), signed-in Join button, and states for expired, other account (sign out), already in a wedding (empty or not), invalid. `referrer: no-referrer`, `noindex`.
- **Stitch** `ae469d1c…` (Settings: Wedding Members), `89459a8f…` (Join by Invitation states). Left out: "Atelier" labels, search bar, "Standard Suite Tier", "Delete my wedding and join" (needs slice 13).
- **Tests:** `tests/security/members.int.test.ts` (own DB, 14), migration test for 0005, unit tests for schemas, email and `safeNext`, e2e `join.spec.ts` (invalid link, login returns to the invite).
- **Open:** (1) DB §5.15 has no action for revoked invitations, but API §12 says revoked invitations are "visible in the activity log" — needs a doc decision. (2) "Delete my empty wedding and join" waits for slice 13 (and its §14.8 change). (3) `EMAIL_FROM` must be on a domain verified in Resend before real invitees get mail; until then Admins share the link. (4) Run `pnpm db:migrate` on dev for 0005.
