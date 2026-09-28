# Shaadioo

Wedding-planning web app for Indian weddings: a shared workspace for the family, plus
account-free invitation, RSVP and photo pages for guests.

The product and design docs are in [docs/](docs/). Start with the PRD. Rules for working in
this repo are in [CLAUDE.md](CLAUDE.md).

## Stack

Next.js (App Router) + TypeScript, deployed on Vercel · MongoDB Atlas + Mongoose · Zod ·
Tailwind CSS v4 · next-intl · Vitest + mongodb-memory-server · Playwright.

## Getting started

Requirements: Node 22.12+ (CI uses the version in `.nvmrc`) and corepack.

```sh
corepack enable            # provides the pnpm version pinned in package.json
pnpm install
cp .env.example .env.local # then set MONGODB_URI and APP_ORIGIN
pnpm dev                   # http://localhost:3000, health check at /api/health
```

`MONGODB_URI` must point at a replica set, because transactions need one. An Atlas cluster
works, and so does a local single-node replica set.

## Scripts

| Command                        | What it does                                                                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev` / `build` / `start` | Next.js dev server, production build, production server                                                                         |
| `pnpm lint`                    | ESLint, including the architecture and tenant-isolation rules                                                                   |
| `pnpm format` / `format:check` | Prettier                                                                                                                        |
| `pnpm typecheck`               | Generates route types, then runs `tsc`                                                                                          |
| `pnpm test`                    | Unit and integration tests (integration uses an in-memory MongoDB replica set)                                                  |
| `pnpm test:unit` / `test:int`  | Runs one of the two projects                                                                                                    |
| `pnpm e2e`                     | Playwright on mobile and desktop profiles. Needs `MONGODB_URI` and a Chromium install (`pnpm exec playwright install chromium`) |

## Layout

```
src/app          routing only: pages, layouts, thin route handlers
src/modules      one folder per domain (business logic), see src/modules/README.md
src/server       shared infrastructure: db (tenant guard, unscoped access), http, env, adapters
src/lib          pure utilities used by both client and server
src/components   UI primitives, app shell, wedding themes
src/styles       design tokens and themes
messages         translation files
migrations       forward-only database migrations
tests            test setup, lint-rule tests, security suites, e2e
```
