# Shaadioo — Project Status

**Last updated:** 2026-10-04 · **Current milestone:** M1 Guest Loop (target 15 Nov 2026)
**Next slice:** 3 — Events

This is a one-screen snapshot. Update it in the same PR that finishes or changes a slice.
Detailed history lives in [docs/IMPLEMENTATION_NOTES.md](docs/IMPLEMENTATION_NOTES.md); scope in [docs/PRD.md](docs/PRD.md).

## Done

| What                                            | Merged     | Notes                                                                                        |
| ----------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------- |
| Walking skeleton                                | 2026-09-25 | Next 16, Mongo connection, tenant guard, `/api/health`, lint boundaries, CI                  |
| Slice 0 — design foundation + landing page      | 2026-09-29 | Tokens (brand → semantic → Tailwind), dark mode, UI primitives, static `/`                   |
| Landing redo — new Stitch theme, coded mock-ups | 2026-10-01 | Plum `#4A2943` + brass, Playfair Display, mock-ups as components, copy guardrail test        |
| `/login` sign-in page (light + dark)            | 2026-10-03 | Stitch auth screens recoloured to landing tokens; errors shown by code                       |
| `/signup` page + `/onboarding` placeholder      | 2026-10-03 | Sign-out button; `/onboarding` redirects to `/login` without a session                       |
| Tenant guard: `weddingId` must name one wedding | 2026-09-30 | Blocks `$ne`/`$in`/`$exists` filters                                                         |
| Slice 1a — auth API (signup/login/logout/me)    | 2026-10-01 | Server-side sessions, scrypt, auth rate limits, Origin/JSON checks                           |
| Migration runner + auth indexes in dev          | 2026-10-03 | `pnpm db:migrate`; fixed duplicate-email signups; signed-in redirect off `/login`            |
| Slice 2 — create wedding, app shell, dashboard  | in PR      | Name order choice, date today or later, `POST/GET /api/wedding`, `/app` gate; migration 0002 |

Checks: lint, typecheck, 165 unit + integration tests, 60 e2e tests, build — all green. Slice 2 re-tested manually in Chrome after review fixes (2026-10-04).

## Roadmap

`[x]` done · `[~]` in progress · `[ ]` not started

**M1 — Guest loop (15 Nov 2026)**

- [x] 0 Design foundation + landing page
- [~] 1 Accounts — signup, login, logout, session, auth rate limits _(API, `/login`, `/signup`, sign-out done. Left: `PATCH /api/me` + change password, invite signup → slice 10, forgot/reset → slice 9)_
- [x] 2 Create wedding + app shell + dashboard (countdown) _(dashboard numbers other than days-to-go fill in as modules land)_
- [ ] 3 Events
- [ ] 4 Guests
- [ ] 5 Invitation page + RSVP (5a guest side, 5b member edit, new link, deadline)
- [ ] 6 WhatsApp share + mark sent
- [ ] 7 Wedding website `/w/[slug]` (classic theme)
- [ ] 8 Go-live prep — Vercel prod, Atlas backups + restore test, domain, Resend
- [ ] 9 Email foundation + password reset
- [ ] 10 Wedding members — invite, join, roles, last-admin
- [ ] 11 Guest emails — single, campaigns, reminders _(first to cut if late)_
- [ ] 12 CSV import
- [ ] 13 Delete empty wedding _(must: delete memberships in the same step that marks the wedding DELETING; change DATABASE_DESIGN §14.8 first)_

**M2 — Wedding day (7 Dec 2026):** photo upload (R2) · guest gallery + QR · featured photos · livestream · cleanup/retention jobs
**M3 — Planning & money (31 Jan 2027):** tasks · expenses · vendors · vendor discovery · full dashboard
**M4 — V1 complete (31 Mar 2027):** other two themes · activity log view · settings + danger zone · security review · perf pass · analytics

## Blockers and setup (not code)

- [x] Atlas dev cluster → `MONGODB_URI` for `pnpm dev` (run `pnpm db:migrate` against it after each new migration)
- [ ] Vercel project linked to repo (PR previews)
- [ ] Domain bought + verified in Resend (needed for slice 9; DNS takes days)
- [ ] Stitch designs for guest pages (invitation, gallery, website) and mobile screens (needed for slices 5, 7)
- [ ] Pilot wedding date confirmed

## Known gaps

- CI e2e runs standalone `mongo:8` with no `SESSION_SECRET`, so real sign-in flows are covered only by integration tests and manual runs.
- Integration tests build indexes via `autoIndex`, not the migration files.
- No e2e for `/onboarding` and `/app` (need a real session); covered by `tests/security/wedding.int.test.ts` and manual runs.
- Run `pnpm db:migrate` on each new environment: 0002 holds the one-wedding-per-user index.

## Open decisions

- Wedding deletion (slice 13): DATABASE_DESIGN §14.8 removes memberships in step 3, after R2, so a failed or slow deletion leaves the user unable to create a new wedding for up to a day. Plan: move the membership `deleteMany` into step 1, in one transaction with `status: 'DELETING'`. Until then the create form shows an error instead of looping (guard added 2026-10-04).

- Doc inconsistencies from the setup review not yet fixed in the docs: backups/deploy timing (PRD §16 vs SYSTEM §99), stale vendor edge cases (PRD §14), discovery fields (PRD §9.17 vs API §19), gallery IP rate limit (API §7), sliding session cookie, `firstOpenedAt` vs link-preview bots.
- Landing nav: keep Features / How it works / Privacy / FAQ, or follow Stitch ("Dashboard", "RSVP Experience").
- Tenant guard: replace operations could write a different `weddingId` (no model uses replace yet).
- Account deletion added to PRD §9.25 (2026-10-03): endpoint and cascade still need SYSTEM/DB/API design before M4.
- Stitch auth screens: some still have a stray Bodoni Moda font reference; the code uses Playfair Display.
