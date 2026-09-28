# Domain modules

One folder per domain. Business logic lives here; `src/app` stays thin and `src/server` holds
infrastructure only. Folders are empty until their feature is built.

| File                          | Purpose                                                                                               |
| ----------------------------- | ----------------------------------------------------------------------------------------------------- |
| `index.ts`                    | Public **server** API (`import 'server-only'`). The only file other modules and `src/app` may import. |
| `schemas.ts`                  | Zod request/response schemas + inferred types. Client-safe; shared by route handlers and forms.       |
| `<entity>.model.ts`           | Mongoose schema, indexes, `tenantGuard` plugin, `select: false` secrets.                              |
| `<entity>.repository.ts`      | Every query. Each function takes `weddingId` from `ctx`.                                              |
| `<name>.service.ts`           | Rules: cross-reference checks, transactions, activity-log entry. Takes `ctx`.                         |
| `mapper.ts`                   | Database document → API shape (API_DESIGN API-09).                                                    |
| `*.test.ts` / `*.int.test.ts` | Unit / integration tests, colocated.                                                                  |

Import rules are enforced by ESLint (`eslint.config.mjs`) and covered by `tests/lint`.
