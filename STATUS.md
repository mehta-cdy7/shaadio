# Shaadio — Project Status

**Last updated:** 2026-10-16 · **Production:** https://shaadio.in · **Current milestone:** M1 Guest Loop (target 15 Nov 2026)
**Next slice:** M2 Photos B — guest gallery + QR (Part A, member photos, done), then C, then 9 — Password reset, then Tasks

This is a one-screen snapshot. Update it in the same PR that finishes or changes a slice.
Detailed history lives in [docs/IMPLEMENTATION_NOTES.md](docs/IMPLEMENTATION_NOTES.md); scope in [docs/PRD.md](docs/PRD.md).

## Done

| What                                            | Merged     | Notes                                                                                             |
| ----------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------- |
| Walking skeleton                                | 2026-09-25 | Next 16, Mongo connection, tenant guard, `/api/health`, lint boundaries, CI                       |
| Slice 0 — design foundation + landing page      | 2026-09-29 | Tokens (brand → semantic → Tailwind), dark mode, UI primitives, static `/`                        |
| Landing redo — new Stitch theme, coded mock-ups | 2026-10-01 | Plum `#4A2943` + brass, Playfair Display, mock-ups as components, copy guardrail test             |
| `/login` sign-in page (light + dark)            | 2026-10-03 | Stitch auth screens recoloured to landing tokens; errors shown by code                            |
| `/signup` page + `/onboarding` placeholder      | 2026-10-03 | Sign-out button; `/onboarding` redirects to `/login` without a session                            |
| Tenant guard: `weddingId` must name one wedding | 2026-09-30 | Blocks `$ne`/`$in`/`$exists` filters                                                              |
| Slice 1a — auth API (signup/login/logout/me)    | 2026-10-01 | Server-side sessions, scrypt, auth rate limits, Origin/JSON checks                                |
| Migration runner + auth indexes in dev          | 2026-10-03 | `pnpm db:migrate`; fixed duplicate-email signups; signed-in redirect off `/login`                 |
| Slice 2 — create wedding, app shell, dashboard  | 2026-10-04 | Name order choice, date today or later, `POST/GET /api/wedding`, `/app` gate; migration 0002      |
| Settings → Wedding details (edit the wedding)   | 2026-10-04 | `PATCH /api/wedding`, shared create/edit form, settings tabs; other tabs "Coming soon"            |
| Slice 3 — Events                                | 2026-10-05 | List, add/edit with preview, delete with preview dialog; activity log module; migration 0003      |
| Slice 4 — Guests                                | 2026-10-05 | List + filters + stats, add/edit with preview, detail, member RSVP, new link; migration 0004      |
| Slice 5 — Invitation page + RSVP                | 2026-10-05 | `/invite/[token]`, public invite + RSVP API, deadline lock, Settings RSVP deadline card           |
| Slice 6 — WhatsApp share + mark sent            | 2026-10-06 | `POST /api/guests/:id/mark-sent` (first one wins), share + preview on detail, row menu items      |
| Slice 7 — Wedding website                       | 2026-10-11 | `/w/[slug]` classic theme, publish/unpublish (logged), `/app/website` share + welcome message     |
| Slice 10 — Wedding members                      | 2026-10-11 | Invite by email + WhatsApp/copy link, `/join/[token]`, roles, last-admin guard; migration 0005    |
| Slice 11 — Invitations + guest emails           | 2026-10-15 | `/app/invitations`, single + queued email campaigns, 09:00 IST cron, daily quota; mig 0006–07     |
| M2 Photos A — member photos                     | 2026-10-16 | `/app/photos`: in-browser resize, direct-to-R2 upload, albums, viewer, feature 12; migration 0008 |

Checks: lint, typecheck, 364 unit + integration tests, build — all green, e2e 68/68 (2026-10-16). Slice 10 (members) tested manually in Chrome on 2026-10-11: invite, join by signup, LAST_ADMIN, promote, resend, revoke, ALREADY_MEMBER.

## Roadmap

`[x]` done · `[~]` in progress · `[ ]` not started

**M1 — Guest loop (15 Nov 2026)**

- [x] 0 Design foundation + landing page
- [~] 1 Accounts — signup, login, logout, session, auth rate limits _(API, `/login`, `/signup`, sign-out done. Left: `PATCH /api/me` + change password, invite signup → slice 10, forgot/reset → slice 9)_
- [x] 2 Create wedding + app shell + dashboard (countdown) _(dashboard numbers other than days-to-go fill in as modules land)_
- [x] 3 Events _(headcounts, delete preview and cascade now read guests)_
- [x] 4 Guests _(also took 5b: member RSVP edit and regenerate link)_
- [x] 5 Invitation page + RSVP _(guest side and RSVP deadline; member edit and new link landed in slice 4)_
- [x] 6 WhatsApp share + mark sent
- [x] 7 Wedding website `/w/[slug]` (classic theme) _(cover photo, featured photos, livestream in M2)_
- [ ] 8 Go-live prep — Vercel prod, Atlas backups + restore test, domain, Resend
- [ ] 9 Email foundation + password reset
- [x] 10 Wedding members — invite, join, roles, last-admin _(built ahead of 7–9; "delete empty wedding and join" waits for 13)_
- [x] 11 Invitations & RSVPs + guest emails — single and queued campaigns _(RSVP email reminders moved to V2; prod needs `CRON_SECRET` + migrations 0006, 0007)_
- [ ] 12 CSV import
- [ ] 13 Delete empty wedding _(must: delete memberships in the same step that marks the wedding DELETING; change DATABASE_DESIGN §14.8 first)_

**M2 — Wedding day (7 Dec 2026):** photo upload (R2) · guest gallery + QR · featured photos · livestream · cleanup/retention jobs

- [x] Photos A — member photos: upload, albums, viewer, feature, download, delete, gallery settings API
- [ ] Photos B — guest gallery `/gallery/[token]`, device/IP limits, QR card (needs the `qrcode` library approved), guest switches UI
- [ ] Photos C — website glimpse, wedding/event covers, upload cleanup + retention jobs
- [ ] Livestream
      **M3 — Planning & money (31 Jan 2027):** tasks · expenses · vendors · vendor discovery · full dashboard
      **M4 — V1 complete (31 Mar 2027):** other two themes · activity log view · settings + danger zone · security review · perf pass · analytics

## Blockers and setup (not code)

- [x] Atlas dev cluster → `MONGODB_URI` for `pnpm dev` (run `pnpm db:migrate` against it after each new migration)
- [x] Vercel project linked; production live on `shaadio.in` (2026-10-11)
- [x] R2 dev + prod buckets, CORS, staging rule, tokens, `media.shaadio.in`, Vercel vars; `pnpm r2:check` passed on both (2026-10-16). DNS for `shaadio.in` moved to Cloudflare; `www` redirects to the apex
- [ ] Domain bought + verified in Resend (needed for slice 9; DNS takes days). Resend key + `EMAIL_FROM` are in `.env.local`; until the domain is verified, member invites reach only the Resend account owner, so Admins share the link on WhatsApp
- [ ] Stitch designs for guest pages (invitation, gallery, website) and mobile screens (needed for slices 5, 7)
- [ ] Pilot wedding date confirmed

## Known gaps

- CI e2e runs standalone `mongo:8` with no `SESSION_SECRET`, so real sign-in flows are covered only by integration tests and manual runs.
- Integration tests build indexes via `autoIndex`, not the migration files.
- No e2e for `/onboarding` and `/app` (need a real session); covered by `tests/security/wedding.int.test.ts` and manual runs.
- Run `pnpm db:migrate` on each new environment: 0002 holds the one-wedding-per-user index.

## Open decisions

- Tasks (M3) pulled forward to right after slices 11 and 9, at the product owner's request (2026-10-12).

- Revoked member invitations: API §12 says they show in the activity log, but DB §5.15 has no action for it. Decide and add `member.invitation_revoked` (or drop the API sentence).

- Wedding deletion (slice 13): DATABASE_DESIGN §14.8 removes memberships in step 3, after R2, so a failed or slow deletion leaves the user unable to create a new wedding for up to a day. Plan: move the membership `deleteMany` into step 1, in one transaction with `status: 'DELETING'`. Until then the create form shows an error instead of looping (guard added 2026-10-04).

- Doc inconsistencies from the setup review not yet fixed in the docs: backups/deploy timing (PRD §16 vs SYSTEM §99), stale vendor edge cases (PRD §14), discovery fields (PRD §9.17 vs API §19), gallery IP rate limit (API §7), sliding session cookie, `firstOpenedAt` vs link-preview bots.
- Landing nav: keep Features / How it works / Privacy / FAQ, or follow Stitch ("Dashboard", "RSVP Experience").
- Tenant guard: replace operations could write a different `weddingId` (no model uses replace yet).
- Account deletion added to PRD §9.25 (2026-10-03): endpoint and cascade still need SYSTEM/DB/API design before M4.
- Stitch auth screens: some still have a stray Bodoni Moda font reference; the code uses Playfair Display.
