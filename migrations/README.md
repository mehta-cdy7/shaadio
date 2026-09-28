# Migrations

Numbered, forward-only, idempotent scripts (`0001_<name>.ts`, each exporting `up(db)`), applied in
order and recorded in `schema_migrations`. Production indexes are created here, never by
`autoIndex` or `syncIndexes()`. Take a backup before running against production.
See DATABASE_DESIGN §17. The runner arrives with the first real model.
