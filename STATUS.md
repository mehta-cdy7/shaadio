# Shaadioo — Project Status

**Last updated:** 2026-10-03 · **Current milestone:** M1 Guest Loop (target 15 Nov 2026)
**Next slice:** 2 — Create wedding + app shell + dashboard (countdown)

This is a one-screen snapshot. Update it in the same PR that finishes or changes a slice.
Detailed history lives in [docs/IMPLEMENTATION_NOTES.md](docs/IMPLEMENTATION_NOTES.md); scope in [docs/PRD.md](docs/PRD.md).

## Done

| What                                            | Merged     | Notes                                                                                 |
| ----------------------------------------------- | ---------- | ------------------------------------------------------------------------------------- |
| Walking skeleton                                | 2026-09-25 | Next 16, Mongo connection, tenant guard, `/api/health`, lint boundaries, CI           |
| Slice 0 — design foundation + landing page      | 2026-09-29 | Tokens (brand → semantic → Tailwind), dark mode, UI primitives, static `/`            |
| Landing redo — new Stitch theme, coded mock-ups | 2026-10-01 | Plum `#4A2943` + brass, Playfair Display, mock-ups as components, copy guardrail test |
| `/login` sign-in page (light + dark)            | 2026-10-03 | Stitch auth screens recoloured to landing tokens; errors shown by code                |
| `/signup` page + `/onboarding` placeholder      | 2026-10-03 | Sign-out button; `/onboarding` redirects to `/login` without a session                |
| Tenant guard: `weddingId` must name one wedding | 2026-09-30 | Blocks `$ne`/`$in`/`$exists` filters                                                  |
| Slice 1a — auth API (signup/login/logout/me)    | 2026-10-01 | Server-side sessions, scrypt, auth rate limits, Origin/JSON checks                    |
| Migration runner + auth indexes in dev          | 2026-10-03 | `pnpm db:migrate`; fixed duplicate-email signups; signed-in redirect off `/login`     |

Checks: lint, typecheck, 131 unit + integration tests, 58 e2e tests, build — all green.

## Roadmap

`[x]` done · `[~]` in progress · `[ ]` not started

**M1 — Guest loop (15 Nov 2026)**

- [x] 0 Design foundation + landing page
- [~] 1 Accounts — signup, login, logout, session, auth rate limits _(API, `/login`, `/signup`, sign-out done. Left: `PATCH /api/me` + change password, invite signup → slice 10, forgot/reset → slice 9)_
- [ ] 2 Create wedding + app shell + dashboard (countdown)
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
- [ ] 13 Delete empty wedding

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
- `/app` not built yet: a successful sign-in lands on a 404 until slice 2.

## Open decisions

- Doc inconsistencies from the setup review not yet fixed in the docs: backups/deploy timing (PRD §16 vs SYSTEM §99), stale vendor edge cases (PRD §14), discovery fields (PRD §9.17 vs API §19), gallery IP rate limit (API §7), sliding session cookie, `firstOpenedAt` vs link-preview bots.
- Landing nav: keep Features / How it works / Privacy / FAQ, or follow Stitch ("Dashboard", "RSVP Experience").
- Tenant guard: replace operations could write a different `weddingId` (no model uses replace yet).
- Account deletion added to PRD §9.25 (2026-10-03): endpoint and cascade still need SYSTEM/DB/API design before M4.
- Stitch auth screens: some still have a stray Bodoni Moda font reference; the code uses Playfair Display.
