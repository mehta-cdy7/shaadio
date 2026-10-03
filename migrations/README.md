# Migrations

Numbered, forward-only, idempotent scripts (`0001_<name>.ts`, each exporting `up(db)`), applied in
order and recorded in `schema_migrations`. Production indexes are created here, never by
`autoIndex` or `syncIndexes()`. Take a backup before running against production.
See DATABASE_DESIGN §17.

Run with `pnpm db:migrate` (`scripts/migrate.ts`; reads `.env.local`). Register each new file in
`MIGRATIONS` in `runner.ts`; `tests/db/migrations.test.ts` fails if one is missing. A database whose
name contains `prod` is refused unless `--production` is passed.
