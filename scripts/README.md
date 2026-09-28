# Operator scripts

Run by hand, never by the app: `db:migrate` (DATABASE_DESIGN §17.1), `db:reconcile` (§9.6),
dev seed data. Each script must refuse to run against production unless explicitly told to.
