# Shaadioo
## API Design Document

**Version:** V1 (Document revision 1)
**Status:** Baseline — aligned with PRD revision 3, SYSTEM_DESIGN revision 3, DATABASE_DESIGN revision 1
**Style:** REST over JSON, Next.js Route Handlers
**Scope:** Endpoints, request and response shapes, authentication, authorization, errors, pagination, concurrency, rate limits

---

# 0. How to Read This Document

§1–§8 are the rules every endpoint follows. §9 lists every endpoint on one page. §10–§28 define each group. §29 is the stable-sharing exception referenced by SYSTEM §22. §30–§31 are tests and decisions.

Request and response bodies are written as TypeScript types. In code, these are Zod schemas in each module's `schemas.ts`, shared by the route handler and the client form, so client and server validate with the same rules.

Order of authority: PRD → SYSTEM_DESIGN → DATABASE_DESIGN → this document. A disagreement is a defect to fix.

---

# 1. Conventions

## 1.1 Base

- All endpoints are under `/api`, same origin as the app.
- **No version prefix** (`/api/v1`). The only client is this app, deployed together with the API, so a breaking change ships to both at once (API-02).
- Request and response bodies are JSON (`Content-Type: application/json`). There are no multipart endpoints: files go directly to R2 (§22) and CSV is parsed in the browser (§15).

## 1.2 Field formats

| Kind | API format | Example |
|---|---|---|
| Ids | string (ObjectId hex) | `"66f1c2a9e4b0a1b2c3d4e5f6"` |
| Instants | ISO 8601 UTC string | `"2026-12-14T14:30:00.000Z"` |
| Calendar dates | `"YYYY-MM-DD"` | `"2026-12-14"` |
| Wall-clock times | `"HH:mm"` in the wedding's timezone | `"20:00"` |
| Money | integer paise, field suffix `Paise` | `"amountPaise": 12450000` |
| Phone | E.164 on output; any common Indian format accepted on input | `"+919876543210"` |
| Enums | `UPPER_SNAKE` strings | `"NOT_ATTENDING"` |

Formats follow `DATABASE_DESIGN.md` §1 exactly. The API never converts paise to rupees or times to another timezone; the UI does.

## 1.3 Optional fields and clearing

- An optional field with no value is **omitted** from responses, never `null`.
- In a `PATCH`, an omitted field is unchanged, and `null` **clears** it (becomes `$unset`, DB-07).

```json
PATCH /api/tasks/66f1…   { "eventId": null, "priority": "HIGH" }
```

Clears the task's event and sets priority. Every other field is unchanged.

## 1.4 Strict request schemas

Every request schema is **strict**: an unknown field is a `400 VALIDATION_ERROR`, not ignored. In particular, a client cannot send `weddingId`, `role`, `version`, `createdByUserId` or any other server-owned field in a body (API-04).

## 1.5 Verbs

| Operation | Method | Success |
|---|---|---|
| List / read | `GET` | `200` |
| Create | `POST /api/things` | `201` with the created resource |
| Partial update | `PATCH /api/things/:id` | `200` with the updated resource |
| Replace a single setting | `PUT` | `200` |
| Delete | `DELETE /api/things/:id` | `204`, no body |
| Command (not plain CRUD) | `POST /api/things/:id/<verb>` | `200`, or `202` when work continues in the background |

Commands are named verbs — `/publish`, `/resend`, `/regenerate-link` — rather than status fields to patch, because each has side effects and its own permission (API-07).

---

# 2. Authentication and CSRF

## 2.1 Session cookie

Login and signup set one cookie:

```text
Set-Cookie: sid=<256-bit token>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000
```

Every member endpoint reads it, resolves the session (`DATABASE_DESIGN.md` §5.2), then resolves the membership. There are no bearer tokens and no API keys in V1.

## 2.2 CSRF

The API uses cookies, so cross-site request forgery must be prevented. Three layers:

1. **`SameSite=Lax`** — the browser does not send the cookie on cross-site `POST`, `PATCH` or `DELETE`.
2. **JSON only** — every mutating endpoint requires `Content-Type: application/json`. An HTML form on another site cannot send that without a CORS preflight, which the API never approves.
3. **Origin check** — every mutating request must carry an `Origin` header equal to the app origin. Anything else is `403 FORBIDDEN`.

No CSRF token is needed on top of these. Public token endpoints (§24–§25) apply the same JSON and Origin rules.

## 2.3 Internal endpoints

`/api/internal/*` accepts only `Authorization: Bearer <CRON_SECRET>`, compared in constant time. Vercel Cron sends this header on its scheduled `GET` requests.

---

# 3. Wedding Context and Authorization

## 3.1 The wedding is implicit

Member endpoints do **not** contain a wedding id:

```text
GET /api/guests               ✓
GET /api/weddings/:id/guests  ✗
```

The wedding comes from the caller's membership (SYSTEM §65). There is nothing in the URL or body for a caller to change, so there is nothing to validate (API-01). If multiple weddings per user arrive later, the session gains a "current wedding" and the URLs stay the same.

## 3.2 Request context

Every member route handler is wrapped:

```ts
export const PATCH = withMember({ role: 'MANAGER' }, async (req, ctx) => {
  // ctx = { userId, weddingId, role, requestId }
});
```

`withMember` authenticates the session, resolves the membership, checks the wedding is `ACTIVE`, checks the minimum role, and passes `ctx` to the handler. Services receive `ctx`, never raw request values, so the tenant guard (`DATABASE_DESIGN.md` §6.2) always has a `weddingId` to scope with.

| Failure | Response |
|---|---|
| No or expired session | `401 UNAUTHENTICATED` |
| Signed in, no membership | `403 NO_WEDDING` (client routes to "create or join a wedding") |
| Wedding is `DELETING` | `403 NO_WEDDING` |
| Role too low | `403 FORBIDDEN` |

## 3.3 Other weddings' ids return 404

A request for an id that exists in **another** wedding returns `404 NOT_FOUND`, the same as an id that does not exist anywhere. A `403` would confirm that the id is real (API-03).

## 3.4 Roles

"Member" means Admin or Manager.

| Capability | Admin | Manager |
|---|---|---|
| Everything in events, tasks, guests, invitations, expenses, vendors, website, livestream, gallery, photos | ✓ | ✓ |
| Invite, remove, change role of members | ✓ | — |
| Revoke or resend member invitations | ✓ | — |
| View activity log | ✓ | — |
| Delete the wedding | ✓ | — |

This table is the complete permission model (PRD §4).

---

# 4. Responses and Errors

## 4.1 Success

- A single resource is returned **directly**, not wrapped: `{ "id": "…", "name": "…" }`.
- A paginated list is `{ "items": [...], "nextCursor": "…" }`; `nextCursor` is omitted on the last page.
- A bounded list (§5.1) is `{ "items": [...] }`.

## 4.2 Error envelope

```ts
type ErrorResponse = {
  error: {
    code: ErrorCode;        // stable, machine-readable; the client switches on this
    message: string;        // human-readable English, safe to show
    details?: unknown;      // code-specific, documented per code
    requestId: string;      // also in the X-Request-Id header; quote it in bug reports
  };
};
```

`message` never contains stack traces, query text, token values or other weddings' data.

## 4.3 Error codes

| Code | HTTP | Meaning | `details` |
|---|---|---|---|
| `VALIDATION_ERROR` | 400 | Body or query failed the schema | `{ fields: { [path]: string } }` |
| `UNAUTHENTICATED` | 401 | No valid session | |
| `INVALID_CREDENTIALS` | 401 | Login failed (same response for unknown email and wrong password) | |
| `FORBIDDEN` | 403 | Role too low, or Origin check failed | |
| `NO_WEDDING` | 403 | Signed in without an active wedding | |
| `INVITE_EMAIL_MISMATCH` | 403 | Accepting a member invitation with a different account email | |
| `NOT_FOUND` | 404 | Does not exist, belongs to another wedding, or public link unavailable | |
| `PAYLOAD_TOO_LARGE` | 413 | Body over the limit (§8.3) | |
| `RATE_LIMITED` | 429 | See §7; `Retry-After` header is set | `{ retryAfterSeconds }` |
| `CONFLICT` | 409 | Generic conflict | |
| `EMAIL_TAKEN` | 409 | Signup with an existing email | |
| `ALREADY_MEMBER` | 409 | User already belongs to a wedding | |
| `INVITATION_PENDING` | 409 | Pending invitation already exists for this email | |
| `INVITATION_EXPIRED` | 409 | Member invitation expired or revoked | |
| `LAST_ADMIN` | 409 | Change would leave zero Admins | |
| `VERSION_CONFLICT` | 409 | `expectedVersion` did not match (§6.1) | `{ current: Guest }` |
| `BELOW_CONFIRMED` | 409 | `maxPeople` lower than the guest's confirmed count | `{ attendingCount }` |
| `CAPACITY_EXCEEDED` | 409 | RSVP count above `maxPeople` | `{ maxPeople }` |
| `RSVP_LOCKED` | 409 | RSVP deadline has passed | `{ rsvpDeadline }` |
| `NO_EVENTS` | 409 | Guest is not invited to any event | |
| `LIMIT_REACHED` | 409 | A soft limit (guests, events, members) was reached | `{ limit }` |
| `GALLERY_FULL` | 409 | Not enough photo slots | `{ remaining }` |
| `FEATURED_LIMIT` | 409 | Already 12 featured photos | |
| `UPLOADS_DISABLED` | 409 | Guest uploads are switched off | |
| `VENDOR_EXISTS` | 409 | This Google place is already a saved vendor | `{ vendorId }` |
| `CONFIRMATION_MISMATCH` | 409 | Typed wedding name did not match | |
| `EMAIL_QUOTA_EXHAUSTED` | 503 | Today's sending quota is used up | `{ resetsAt }` |
| `EMAIL_PROVIDER_ERROR` | 502 | Resend rejected or failed the send | |
| `DISCOVERY_UNAVAILABLE` | 503 | Google Places failed or quota exceeded | |
| `INTERNAL_ERROR` | 500 | Unexpected failure | |

Adding a code is not a breaking change. Changing what an existing code means is.

## 4.4 Public-link failures are indistinguishable

For every public token endpoint (§24–§26), an invalid token, a regenerated token, a deleted guest and a `DELETING` wedding all return the **same** `404 NOT_FOUND` with the message "This link isn't available." Nothing reveals which case happened (SYSTEM §61).

---

# 5. Lists, Pagination and Filters

## 5.1 Bounded lists return everything

Collections with a small hard or soft cap return all items, unpaginated:

| List | Cap |
|---|---|
| Events | 30 |
| Members | 25 |
| Member invitations | ~25 |
| Vendors | dozens |
| Email campaigns | a handful |

## 5.2 Growing lists use cursors

Guests, tasks, expenses, photos and activity entries are cursor-paginated:

```text
GET /api/guests?limit=50&cursor=eyJuIjoiU2hhcm1hIiwiaSI6IjY2ZjEuLi4ifQ
```

| Parameter | Rule |
|---|---|
| `limit` | 1–100, default 50 (photos default 40) |
| `cursor` | Opaque string from the previous response. Clients must not build or parse it |

The cursor encodes the sort key plus `_id` as a tiebreak (`DATABASE_DESIGN.md` §13.5), so items are never skipped or repeated when many share a timestamp or name. Cursors are **not** offsets: inserts and deletes between pages do not shift results.

A cursor from a different filter combination is rejected with `400 VALIDATION_ERROR`, because the cursor records which filters it was issued for.

## 5.3 Filters

Filters are query parameters, combined with AND. Each endpoint lists its own. Multi-value filters repeat the parameter (`?side=BRIDE&side=BOTH`).

---

# 6. Concurrency and Idempotency

## 6.1 Where versions are checked

Almost everything is last-write-wins (PRD Rule 8). The one exception where silently overwriting would lose someone's answer is a **member editing a guest's RSVP by hand** while the guest may be answering through their link. That request carries the version the member loaded:

```json
PATCH /api/guests/66f1…/rsvp
{ "status": "ATTENDING", "attendingCount": 4, "expectedVersion": 7 }
```

Mismatch → `409 VERSION_CONFLICT` with the current guest in `details.current`, so the UI can show "Rajesh answered from his link while you were editing: Attending, 3" and let the member decide.

Every `Guest` response includes `version`. No other resource exposes one.

## 6.2 Limits enforced in the update itself

`maxPeople`, RSVP capacity, the last-Admin rule, photo slots and featured photos are enforced by conditional database updates (`DATABASE_DESIGN.md` §9–§10), not by a check followed by a write. The API surfaces their failures as the specific 409 codes in §4.3.

## 6.3 Safe retries

| Endpoint | Retry behaviour |
|---|---|
| RSVP submit (public) | Idempotent: same answer twice leaves the same state |
| Create email campaign | A guest already queued or sent in an unfinished campaign of the same kind is skipped, so a double click cannot email anyone twice |
| Photo `complete` | Each upload publishes at most once (§22) |
| Mark invitation sent | Idempotent |
| `DELETE` | A second `DELETE` of the same id returns `404`, which the client treats as success |
| Wedding delete | Resumable (`DATABASE_DESIGN.md` §14.8) |

`POST` creates (guest, task, expense) are **not** idempotent in V1. The UI disables the submit button while a request is in flight.

---

# 7. Rate Limits

Implemented with the `rate_limits` collection (`DATABASE_DESIGN.md` §5.16). Exceeding a limit returns `429 RATE_LIMITED` with `Retry-After`.

| Scope | Key | Limit |
|---|---|---|
| Login | email | 10 / 15 min |
| Login | IP | 30 / 15 min |
| Signup | IP | 10 / hour |
| Forgot password | email | 3 / hour |
| Public invitation GET and `opened` | IP | 120 / min |
| RSVP submit | invitation | 20 / 15 min |
| RSVP submit | global | 300 / min |
| Public gallery GET | IP | 300 / min |
| Photo upload requests (guest) | device | 150 photos / day |
| Photo upload requests (guest) | IP | 2,000 photos / day |
| Vendor discovery | user | 30 / hour |
| Member invitations | wedding | 20 / day |
| Single guest invitation email | wedding | 50 / day, and never from the transactional reserve |

**IP** is taken from Vercel's `x-real-ip`. The per-IP upload limit is deliberately generous: a whole reception shares one venue Wi-Fi address (SYSTEM §97).

**Device** is the `X-Device-Id` header: a random id the gallery page generates once and keeps in the browser. It is a limit on ordinary use, not a security boundary; it is HMAC-hashed before storage.

---

# 8. Headers and Limits

## 8.1 Response headers

| Header | Applies to | Value |
|---|---|---|
| `X-Request-Id` | All | Unique per request |
| `Cache-Control` | All `/api` responses | `no-store` |
| `X-Robots-Tag` | Public token endpoints | `noindex, nofollow` |
| `Referrer-Policy` | Public token pages and endpoints | `no-referrer` |

`no-referrer` matters for the invitation page: without it, clicking the venue's map link would send the full invitation URL, token included, to the map site.

## 8.2 Logging

Request logs record method, route **pattern** (`/api/public/invite/[token]`), status, duration, `requestId`, `userId` and `weddingId`. They never record bodies, cookies, or the concrete path of a token route.

**Accepted risk:** Vercel's own platform request logs record full paths, including invitation and gallery tokens, and are outside application control. Access to those logs is limited to the project owner, and they are retained only briefly. Invitation links must be URLs, so this is accepted rather than engineered around (API-10).

## 8.3 Body size

| Endpoint | Max body |
|---|---|
| Guest import (`/api/guests/import*`) | 1 MB (≈ 1,000 rows) |
| Everything else | 64 KB |

---

# 9. Endpoint Index

`M` = any member, `A` = Admin only, `—` = no session (public or token).

| Method | Path | Who | § |
|---|---|---|---|
| POST | `/api/auth/signup` | — | 10 |
| POST | `/api/auth/login` | — | 10 |
| POST | `/api/auth/logout` | M* | 10 |
| POST | `/api/auth/forgot-password` | — | 10 |
| POST | `/api/auth/reset-password` | — | 10 |
| GET | `/api/me` | M* | 10 |
| PATCH | `/api/me` | M* | 10 |
| POST | `/api/me/password` | M* | 10 |
| POST | `/api/wedding` | M* | 11 |
| GET | `/api/wedding` | M | 11 |
| PATCH | `/api/wedding` | M | 11 |
| POST | `/api/wedding/delete` | A | 11 |
| GET | `/api/dashboard` | M | 11 |
| GET | `/api/members` | M | 12 |
| PATCH | `/api/members/:userId` | A | 12 |
| DELETE | `/api/members/:userId` | A | 12 |
| GET | `/api/member-invitations` | A | 12 |
| POST | `/api/member-invitations` | A | 12 |
| POST | `/api/member-invitations/:id/resend` | A | 12 |
| POST | `/api/member-invitations/:id/revoke` | A | 12 |
| POST | `/api/member-invitations/accept` | M* | 12 |
| GET | `/api/events` | M | 13 |
| POST | `/api/events` | M | 13 |
| GET | `/api/events/:id` | M | 13 |
| PATCH | `/api/events/:id` | M | 13 |
| GET | `/api/events/:id/delete-preview` | M | 13 |
| DELETE | `/api/events/:id` | M | 13 |
| GET | `/api/guests` | M | 14 |
| POST | `/api/guests` | M | 14 |
| GET | `/api/guests/:id` | M | 14 |
| PATCH | `/api/guests/:id` | M | 14 |
| PATCH | `/api/guests/:id/rsvp` | M | 14 |
| POST | `/api/guests/:id/regenerate-link` | M | 14 |
| DELETE | `/api/guests/:id` | M | 14 |
| POST | `/api/guests/import/preview` | M | 15 |
| POST | `/api/guests/import` | M | 15 |
| POST | `/api/guests/:id/mark-sent` | M | 16 |
| POST | `/api/guests/:id/send-invitation-email` | M | 16 |
| GET | `/api/email-campaigns` | M | 16 |
| POST | `/api/email-campaigns` | M | 16 |
| GET | `/api/email-campaigns/:id` | M | 16 |
| POST | `/api/email-campaigns/:id/retry-failed` | M | 16 |
| GET/POST | `/api/tasks` | M | 17 |
| GET/PATCH/DELETE | `/api/tasks/:id` | M | 17 |
| GET/POST | `/api/expenses` | M | 18 |
| GET | `/api/expenses/summary` | M | 18 |
| GET/PATCH/DELETE | `/api/expenses/:id` | M | 18 |
| GET/POST | `/api/vendors` | M | 19 |
| GET/PATCH/DELETE | `/api/vendors/:id` | M | 19 |
| GET | `/api/vendors/discover` | M | 19 |
| POST | `/api/vendors/from-google` | M | 19 |
| GET/PATCH | `/api/website` | M | 20 |
| POST | `/api/website/publish` | M | 20 |
| POST | `/api/website/unpublish` | M | 20 |
| PUT/DELETE | `/api/livestream` | M | 20 |
| GET/PATCH | `/api/gallery/settings` | M | 21 |
| GET | `/api/photos` | M | 21 |
| PATCH/DELETE | `/api/photos/:id` | M | 21 |
| POST | `/api/photos/upload-requests` | M | 22 |
| POST | `/api/photos/complete` | M | 22 |
| POST | `/api/photos/cancel` | M | 22 |
| POST | `/api/covers/upload-request` | M | 23 |
| POST | `/api/covers/complete` | M | 23 |
| DELETE | `/api/covers` | M | 23 |
| GET | `/api/public/invite/:token` | — | 24 |
| POST | `/api/public/invite/:token/opened` | — | 24 |
| POST | `/api/public/invite/:token/rsvp` | — | 24 |
| GET | `/api/public/gallery/:token` | — | 25 |
| GET | `/api/public/gallery/:token/photos` | — | 25 |
| POST | `/api/public/gallery/:token/upload-requests` | — | 25 |
| POST | `/api/public/gallery/:token/complete` | — | 25 |
| POST | `/api/public/gallery/:token/cancel` | — | 25 |
| GET | `/api/public/member-invitations/:token` | — | 26 |
| GET | `/api/internal/jobs/email` | cron | 27 |
| GET | `/api/internal/jobs/cleanup` | cron | 27 |
| GET | `/api/internal/jobs/retention` | cron | 27 |
| GET | `/api/activity` | A | 28 |
| GET | `/api/health` | — | — |

`M*` = any signed-in user, with or without a wedding.

`/api/health` is for uptime monitors: it pings MongoDB and returns `200 { status: 'ok', db: 'up' }` or `503 { status: 'degraded', db: 'down' }`, with `Cache-Control: no-store` and no version, environment or host details.

**Not in the API:** the wedding website (`/w/:slug`) and the first render of the invitation and gallery pages are Next.js server components that call services directly (API-08). The API serves client-side mutations and refreshes.

---

# 10. Auth and Account

## Types

```ts
type User = { id: string; name: string; email: string };

type MeResponse = {
  user: User;
  membership?: { role: 'ADMIN' | 'MANAGER'; label?: string };
  wedding?: { id: string; brideName: string; groomName: string; weddingDate: string };
};
```

## `POST /api/auth/signup`

```ts
{ name: string; email: string; password: string; memberInviteToken?: string }
```

- Password: 10–128 characters. No composition rules; checked against a short list of the most common passwords.
- With `memberInviteToken`, the account joins that wedding in the same request (PRD Rule 9). The email must equal the invitation's email, otherwise `403 INVITE_EMAIL_MISMATCH` and **no account is created**.
- **201** `MeResponse`, sets the session cookie.
- Errors: `EMAIL_TAKEN`, `INVITATION_EXPIRED`, `INVITE_EMAIL_MISMATCH`, `RATE_LIMITED`.

Signup reveals whether an email is registered (`EMAIL_TAKEN`). This cannot be avoided without email verification, which V1 excludes (ADR-05); the signup rate limit is the mitigation.

## `POST /api/auth/login`

`{ email, password }` → **200** `MeResponse`, sets cookie. Unknown email and wrong password both return `401 INVALID_CREDENTIALS`, with equal timing (the password check runs against a dummy hash when the email is unknown).

## `POST /api/auth/logout`

Deletes the session. **204**, clears the cookie.

## `POST /api/auth/forgot-password`

`{ email }` → **202** always, whether or not the email exists. Sends a reset email only if it does. Draws from the transactional email reserve.

## `POST /api/auth/reset-password`

`{ token, password }` → **204**. Deletes all of the user's sessions; the user signs in again. `400 VALIDATION_ERROR` with `details.fields.token` for an invalid or expired token.

## `GET /api/me`

**200** `MeResponse`. The client calls this on load to decide between the dashboard, "create or join a wedding", and sign-in.

## `PATCH /api/me`

`{ name? }` → **200** `User`. Email changes are not in V1.

## `POST /api/me/password`

`{ currentPassword, newPassword }` → **204**. Deletes all other sessions of this user; keeps the current one.

---

# 11. Wedding and Dashboard

## Types

```ts
type Wedding = {
  id: string;
  brideName: string;
  groomName: string;
  nameOrder: 'BRIDE_FIRST' | 'GROOM_FIRST';   // how the couple's names are shown together
  title?: string;
  description?: string;
  weddingDate: string;                 // "YYYY-MM-DD"
  timezone: string;                    // "Asia/Kolkata"
  location: {
    formattedAddress: string; city: string; state?: string; country?: string;
    lat?: number; lng?: number; googlePlaceId?: string;
  };
  coverImageUrl?: string;
  rsvpDeadline?: string;
  rsvpLocked: boolean;                 // computed: today (wedding tz) > rsvpDeadline
  isEmpty: boolean;                    // no events, guests, tasks, expenses, vendors or photos
  createdAt: string;
};
```

## `POST /api/wedding`

Signed-in user without a wedding.

```ts
{
  brideName: string; groomName: string; weddingDate: string;
  location: Wedding['location'];
  nameOrder?: 'BRIDE_FIRST' | 'GROOM_FIRST';   // default BRIDE_FIRST
  title?: string; description?: string;
  timezone?: string;                   // default "Asia/Kolkata"; not editable later in V1
}
```

**201** `Wedding`. The caller becomes the first Admin; the website slug and gallery token are generated. `409 ALREADY_MEMBER` if the caller already has a wedding.

`weddingDate` must be today or later in the wedding's timezone (PRD §9.2); otherwise `400 VALIDATION_ERROR` with `details.fields.weddingDate`.

## `GET /api/wedding`

**200** `Wedding`.

## `PATCH /api/wedding`

Any of: `brideName`, `groomName`, `nameOrder`, `title`, `description`, `weddingDate`, `location`, `rsvpDeadline`. **200** `Wedding`.

- A new `weddingDate` must be today or later, as on create.
- `rsvpDeadline` (PRD §9.11): a new value must be today or later and on or before the wedding date; `null` removes it. A `weddingDate` earlier than the stored deadline is refused. Both are `400 VALIDATION_ERROR` with `fields.rsvpDeadline` or `fields.weddingDate`.

- The website slug does **not** change when names or date change (SYSTEM §27).
- `timezone` is not editable: changing it would silently move every event's time.
- Cover images use §23.

## `POST /api/wedding/delete`

Admin.

```ts
{ confirmName?: string }   // required unless the wedding isEmpty; must equal the names in nameOrder, e.g. "<brideName> & <groomName>"
```

**202** `{ status: 'DELETING' }`. Access ends immediately for every member, guest link and the website; the data is removed as described in `DATABASE_DESIGN.md` §14.8. The caller stays signed in, now without a wedding.

`409 CONFIRMATION_MISMATCH` if the name does not match. `POST …/delete` rather than `DELETE /api/wedding` because some proxies drop `DELETE` bodies.

## `GET /api/dashboard`

**200**

```ts
{
  daysToGo: number;                    // computed in the wedding's timezone
  events:   { count: number; upcoming: Event[] };                // next 3
  tasks:    { done: number; total: number; upcoming: Task[] };   // next 5 by due date, overdue first
  guests: {
    invitations: number; peopleInvited: number;
    attending: number; notAttending: number; pending: number;
    peopleAttending: number;
    respondedViaLink: number;          // pilot metric numerator (PRD §15)
    notInvitedToAnyEvent: number;      // excluded from all numbers above
  };
  expenses: { totalPaise: number };
  vendors:  { count: number };
}
```

Every number is computed on read (`DATABASE_DESIGN.md` §13.1, DB-06).

---

# 12. Members and Member Invitations

## Types

```ts
type Member = {
  userId: string; name: string; email: string;
  role: 'ADMIN' | 'MANAGER'; label?: string; joinedAt: string;
};

type MemberInvitation = {
  id: string; email: string; role: 'ADMIN' | 'MANAGER'; label?: string;
  status: 'PENDING' | 'EXPIRED' | 'ACCEPTED' | 'REVOKED';   // EXPIRED is computed from expiresAt
  invitedBy: { userId: string; name: string };
  expiresAt: string; createdAt: string;
};
```

## `GET /api/members`

Any member. **200** `{ items: Member[] }`. Managers can see who else is helping; only Admins can change anything.

## `PATCH /api/members/:userId`

Admin. `{ role?, label? }` → **200** `Member`. `409 LAST_ADMIN` if it would leave no Admin.

## `DELETE /api/members/:userId`

Admin. **204**. Their tasks become unassigned. An Admin may remove themselves if another Admin exists. `409 LAST_ADMIN` otherwise.

## `GET /api/member-invitations`

Admin. **200** `{ items: MemberInvitation[] }` — pending and expired only; accepted and revoked invitations are visible in the activity log.

## `POST /api/member-invitations`

Admin. `{ email, role, label? }` → **201** `MemberInvitation`. Sends the invitation email immediately, from the transactional reserve.

Errors: `INVITATION_PENDING`, `ALREADY_MEMBER` (the email belongs to a member of this wedding), `LIMIT_REACHED` (25 members), `EMAIL_QUOTA_EXHAUSTED`.

If the email belongs to someone in **another** wedding, the invitation is still created — the API does not reveal that — and acceptance fails for them with a clear message.

## `POST /api/member-invitations/:id/resend`

Admin. New token and a fresh 7-day expiry; the old link stops working. **200** `MemberInvitation`.

## `POST /api/member-invitations/:id/revoke`

Admin. **200** `MemberInvitation` with `status: 'REVOKED'`.

## `POST /api/member-invitations/accept`

Signed-in user without a wedding. `{ token }` → **200** `MeResponse`.

Errors: `INVITATION_EXPIRED`, `INVITE_EMAIL_MISMATCH`, `ALREADY_MEMBER`. For `ALREADY_MEMBER`, `details.currentWeddingIsEmpty` tells the UI whether to offer "delete your empty wedding and join this one" (SYSTEM §19).

---

# 13. Events

## Types

```ts
type EventType =
  'ROKA' | 'ENGAGEMENT' | 'MEHENDI' | 'HALDI' | 'SANGEET' | 'COCKTAIL' | 'WEDDING' | 'RECEPTION' | 'CUSTOM';

type Event = {
  id: string; name: string; type: EventType;
  date: string; startTime?: string; endTime?: string;
  venue?: { name?: string; address?: string; mapUrl?: string };
  description?: string; dressCode?: string; coverImageUrl?: string;
  headcount: { households: number; people: number };   // confirmed, see note
  createdAt: string; updatedAt: string;
};
```

`headcount` counts guests whose single RSVP is Attending and who are invited to this event (`DATABASE_DESIGN.md` §13.2). Under ADR-13 it means "confirmed guests invited to this event", and the UI labels it that way.

## `GET /api/events`

**200** `{ items: Event[] }`, sorted by date then start time.

## `POST /api/events`

`{ name, type, date, startTime?, endTime?, venue?, description?, dressCode? }` → **201** `Event`. `409 LIMIT_REACHED` at 30.

Validation (PRD §9.5), on create and on any `PATCH` that touches these fields, checked against the stored values: `date` at most one year after the wedding date (earlier and past dates allowed); `endTime` requires `startTime` and must differ from it. Failures are `400 VALIDATION_ERROR` with `details.fields.date` or `details.fields.endTime`.

## `GET /api/events/:id` · `PATCH /api/events/:id`

**200** `Event`.

## `GET /api/events/:id/delete-preview`

**200**

```ts
{
  invitedCount: number;                        // guests invited to this event
  onlyThisEvent: { count: number; names: string[] };   // up to 20 names
  tasks: number; expenses: number; photos: number;     // items that will lose their event link
}
```

Feeds the confirmation dialog in `DATABASE_DESIGN.md` §14.1.

## `DELETE /api/events/:id`

**204**. Runs the full cascade in `DATABASE_DESIGN.md` §14.1.

---

# 14. Guests

## Types

```ts
type Side = 'BRIDE' | 'GROOM' | 'BOTH';
type RsvpStatus = 'PENDING' | 'ATTENDING' | 'NOT_ATTENDING';

type Guest = {
  id: string;
  name: string;
  side?: Side;
  email?: string;
  phone?: string;
  maxPeople: number;
  invitedEventIds: string[];
  rsvp: {
    status: RsvpStatus;
    attendingCount: number;
    respondedAt?: string;
    respondedVia?: 'GUEST_LINK' | 'MEMBER';
  };
  delivery?: { sentAt: string; sentVia: 'EMAIL' | 'WHATSAPP' | 'MANUAL' };
  linkOpenedAt?: string;
  notes?: string;
  version: number;
  createdAt: string; updatedAt: string;
};

type GuestDetail = Guest & { inviteUrl: string };
```

**The API flattens storage.** The database stores `invitedEvents: [{ eventId }]`; the API exposes `invitedEventIds: string[]`. When V1.1 adds per-event RSVP, the API adds a new field rather than changing this one (API-09).

## `GET /api/guests`

Paginated, sorted by name.

| Query | Meaning |
|---|---|
| `search` | Case-insensitive prefix of the name, or digits contained in the phone |
| `side` | Repeatable |
| `eventId` | Invited to this event |
| `rsvpStatus` | Repeatable |
| `sent` | `true` / `false` — invitation delivered or not |
| `opened` | `true` / `false` — link opened or not |
| `noEvents` | `true` — invited to no event |

**200** `{ items: Guest[], nextCursor? }`. `inviteUrl` is **not** included in lists.

## `POST /api/guests`

```ts
{
  name: string; maxPeople: number; invitedEventIds: string[];
  side?: Side; email?: string; phone?: string; notes?: string;
}
```

**201** `GuestDetail`. The invitation token is generated here. Every `invitedEventIds` entry must be an event in this wedding, otherwise `404 NOT_FOUND` with `details.field = 'invitedEventIds'`. `409 LIMIT_REACHED` at 1,000.

## `GET /api/guests/:id`

**200** `GuestDetail`. This is the **only** member endpoint that returns the invitation link (§29).

## `PATCH /api/guests/:id`

Any of `name`, `side`, `email`, `phone`, `maxPeople`, `invitedEventIds` (replaces the whole set), `notes`. **200** `Guest`.

- Last-write-wins; no version required.
- `409 BELOW_CONFIRMED` if `maxPeople` would drop below `rsvp.attendingCount`.
- Changing `invitedEventIds` never changes the RSVP. The response is what the edit screen shows next to the event picker (`DATABASE_DESIGN.md` §14.1).

## `PATCH /api/guests/:id/rsvp`

A member records or corrects an answer (for a guest who replied by phone, for example).

```ts
{ status: RsvpStatus; attendingCount?: number; expectedVersion: number }
```

- `ATTENDING` requires `attendingCount` 1…`maxPeople`.
- `PENDING` resets the answer and clears `respondedAt` and `respondedVia`.
- Allowed after the RSVP deadline; the deadline binds guests, not members.
- **200** `Guest` with `respondedVia: 'MEMBER'`.
- `409 VERSION_CONFLICT` (§6.1), `409 CAPACITY_EXCEEDED`.

## `POST /api/guests/:id/regenerate-link`

**200** `GuestDetail` with the new `inviteUrl`. The old link stops working immediately; `linkOpenedAt` and `delivery` are cleared because the new link has not been sent or opened.

## `DELETE /api/guests/:id`

**204**. Pending emails for this guest are cancelled.

---

# 15. Guest Import

The browser parses the CSV (so the server never handles file uploads or encodings) and sends rows as JSON. The server validates everything again; it never trusts the preview.

## Template

The template is a static file, `/templates/shaadioo-guests.csv`:

```csv
name,side,email,phone,max_people,events,notes
Sharma Family,BRIDE,,98765 43210,4,Wedding|Reception,Ludhiana
```

`events` is a `|`-separated list of event names, matched case-insensitively against this wedding's events.

## Row type

```ts
type ImportRow = {
  rowNumber: number;              // from the file, for error messages
  name: string; side?: string; email?: string; phone?: string;
  maxPeople?: string | number;    // raw, validated server-side
  events?: string; notes?: string;
};
```

## `POST /api/guests/import/preview`

`{ rows: ImportRow[] }` (≤ 1,000) → **200**

```ts
{
  valid: number;
  invalid: { rowNumber: number; errors: string[] }[];
  duplicates: {
    rowNumber: number;
    phone: string;
    matches: { rowNumber?: number; guestId?: string; name: string }[];   // other rows, or existing guests
  }[];
  unknownEvents: string[];        // event names that match nothing
  wouldExceedLimit: boolean;
}
```

Writes nothing.

## `POST /api/guests/import`

`{ rows: ImportRow[]; skipDuplicates: boolean }` → **201**

```ts
{ created: number; skipped: { rowNumber: number; reason: string }[] }
```

Valid rows are inserted; invalid rows are skipped and reported, never partially imported. One `guest.imported` activity entry is written with the count. If the rows would exceed 1,000 guests, nothing is imported: `409 LIMIT_REACHED`.

---

# 16. Sending Invitations

Three ways to deliver an invitation, matching the PRD: WhatsApp share, a single email, and an email campaign.

## `POST /api/guests/:id/mark-sent`

`{ via: 'WHATSAPP' | 'MANUAL' }` → **200** `Guest`.

The WhatsApp button is built entirely in the browser: `https://wa.me/<phone>?text=<message with inviteUrl>`, or `https://wa.me/?text=…` when there is no phone. The browser calls `mark-sent` when the button is tapped. The API cannot know whether the message was actually sent; "sent" means "the family shared it". The message text is in PRD §9.14.

**Idempotent, first one wins.** The update filter requires `delivery` to be absent, so a guest that is already sent (by any channel, including `EMAIL`) is returned unchanged with **200**: no error, and a second tap of either button never changes `sentAt` or `sentVia`. Only `regenerate-link` (§14) clears `delivery`. A real change increments `version`. Not written to the activity log (PRD Activity Log). Foreign or malformed id → **404**.

## `POST /api/guests/:id/send-invitation-email`

Sends immediately. **200** `Guest` with `delivery.sentVia: 'EMAIL'`.

- `400 VALIDATION_ERROR` if the guest has no email.
- `409 NO_EVENTS` if the guest is invited to no event.
- `503 EMAIL_QUOTA_EXHAUSTED` if sending would dip into the transactional reserve (SYSTEM §51).
- `502 EMAIL_PROVIDER_ERROR` — safe to retry.

## Campaign types

```ts
type Campaign = {
  id: string;
  kind: 'GUEST_INVITATION' | 'RSVP_REMINDER';
  counts: { pending: number; processing: number; sent: number; failed: number; cancelled: number };
  estimatedDaysRemaining: number;   // ceil(pending / emails-per-day) at current quota
  createdBy: { userId: string; name: string };
  createdAt: string;
};
```

## `POST /api/email-campaigns`

```ts
{ kind: 'GUEST_INVITATION' | 'RSVP_REMINDER'; guestIds?: string[] }
```

Without `guestIds`, the audience is:

| Kind | Guests with email, invited to ≥ 1 event, and… |
|---|---|
| `GUEST_INVITATION` | …not yet delivered by any channel |
| `RSVP_REMINDER` | …delivered, RSVP `PENDING`, RSVP not locked |

**202** `{ campaign: Campaign; skipped: { noEmail: number; alreadyQueued: number } }`.

The response and the UI say "queued", never "sent". With the free-tier quota, 300 emails take about 4 days (SYSTEM §47); `estimatedDaysRemaining` makes that visible.

`409 RSVP_LOCKED` for a reminder campaign after the deadline.

## `GET /api/email-campaigns` · `GET /api/email-campaigns/:id`

**200** `{ items: Campaign[] }` / `Campaign`. The list returns the 20 most recent.

## `POST /api/email-campaigns/:id/retry-failed`

Moves `FAILED` jobs back to `PENDING` with attempts reset. **202** `Campaign`.

---

# 17. Tasks

```ts
type Task = {
  id: string; title: string; description?: string;
  assignee?: { userId: string; name: string };
  eventId?: string; dueDate?: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  status: 'TODO' | 'IN_PROGRESS' | 'DONE';
  completedAt?: string;
  createdAt: string; updatedAt: string;
};
```

## `GET /api/tasks`

| Query | Meaning |
|---|---|
| `mine=true` | Assigned to the caller |
| `status`, `priority` | Repeatable |
| `eventId`, `assigneeUserId` | |

Sorted by due date (tasks without one last), paginated. **200** `{ items: Task[], nextCursor? }`.

## `POST /api/tasks`

`{ title, description?, assigneeUserId?, eventId?, dueDate?, priority? }` → **201** `Task`. `assigneeUserId` must be a current member; `eventId` must be in this wedding.

## `GET` · `PATCH` · `DELETE /api/tasks/:id`

`PATCH` accepts any creation field plus `status`. Setting `DONE` sets `completedAt`; leaving `DONE` clears it.

---

# 18. Expenses

```ts
type ExpenseCategory =
  'VENUE' | 'CATERING' | 'PHOTOGRAPHY' | 'VIDEOGRAPHY' | 'DECORATION' | 'CLOTHING' | 'JEWELLERY' |
  'ENTERTAINMENT' | 'INVITATIONS' | 'GIFTS' | 'TRAVEL' | 'MAKEUP' | 'MISCELLANEOUS';

type Expense = {
  id: string; title: string; amountPaise: number; date: string;
  category: ExpenseCategory; paidBy?: string;
  eventId?: string; vendorId?: string; notes?: string;
  createdAt: string; updatedAt: string;
};
```

## `GET /api/expenses`

Filters: `category` (repeatable), `eventId`, `vendorId`, `paidBy` (exact). Sorted by date, newest first; paginated.

## `GET /api/expenses/summary`

Accepts the same filters. **200**

```ts
{ totalPaise: number; byCategory: { category: ExpenseCategory; totalPaise: number }[] }
```

## `POST` · `GET` · `PATCH` · `DELETE`

`POST /api/expenses` requires `title`, `amountPaise` (positive integer), `date`, `category`. **201** `Expense`.

---

# 19. Vendors and Discovery

```ts
type VendorCategory =
  'PHOTOGRAPHER' | 'VIDEOGRAPHER' | 'VENUE' | 'CATERER' | 'DECORATOR' | 'DJ' | 'MAKEUP_ARTIST' |
  'MEHENDI_ARTIST' | 'PANDIT' | 'CHOREOGRAPHER' | 'FLORIST' | 'WEDDING_PLANNER' | 'TRANSPORT' | 'OTHER';

type Vendor = {
  id: string; name: string; category: VendorCategory;
  source: 'MANUAL' | 'GOOGLE'; googlePlaceId?: string;
  contactPerson?: string; phone?: string; email?: string; address?: string; website?: string;
  agreedCostPaise?: number;
  recordedPaise: number;              // sum of linked expenses, computed
  eventIds: string[]; notes?: string;
  createdAt: string; updatedAt: string;
};
```

## `GET /api/vendors`

**200** `{ items: Vendor[] }`, grouped by the client. Filter: `category`.

## `POST /api/vendors`

Manual vendor. **201** `Vendor` with `source: 'MANUAL'`.

## `GET` · `PATCH` · `DELETE /api/vendors/:id`

Deleting a vendor keeps its expenses and removes their vendor link.

## `GET /api/vendors/discover`

| Query | Meaning |
|---|---|
| `category` | Required, one of the discovery categories (PRD §9.17) |
| `query` | Optional extra text ("budget", "Punjabi") |
| `lat`, `lng` | Optional; default is the wedding location |

**200**

```ts
{
  results: {
    placeId: string; name: string; address: string;
    rating?: number; ratingCount?: number;
    distanceKm?: number; mapsUrl: string;
    savedVendorId?: string;            // already in My Vendors
  }[];
  attribution: 'Google';               // the UI must show Google attribution with these results
}
```

The server calls Google with a field mask limited to these fields, because richer fields cost more per request. `503 DISCOVERY_UNAVAILABLE` on any Google failure; nothing else in the app depends on discovery.

## `POST /api/vendors/from-google`

`{ placeId, category }` → **201** `Vendor` with `source: 'GOOGLE'`.

The server fetches the place's name, address, phone and website from Google **once**, and copies them into the vendor (ADR-14). The client does not send these fields, so the stored data is exactly what Google returned, and the member can edit it afterwards. `409 VENDOR_EXISTS` if already saved.

---

# 20. Website and Livestream

## `GET /api/website`

**200**

```ts
{
  url: string;                          // https://shaadioo.com/w/akshay-princi-k7x2m9
  published: boolean; publishedAt?: string;
  theme: 'CLASSIC' | 'MINIMAL' | 'MODERN';
  welcomeMessage?: string;
  featuredPhotoCount: number;           // of 12
  livestream?: { youtubeVideoId: string; sourceUrl: string };
}
```

## `PATCH /api/website`

`{ theme?, welcomeMessage? }` → **200**. In Milestone 1 only `CLASSIC` is accepted (PRD §16); the enum already contains all three so enabling the others is not an API change.

## `POST /api/website/publish` · `POST /api/website/unpublish`

**200** website. Unpublish takes effect on the next request to `/w/:slug`.

## `PUT /api/livestream`

`{ url }` → **200** `{ youtubeVideoId, sourceUrl }`. Accepts `youtube.com/live/…`, `youtube.com/watch?v=…` and `youtu.be/…`. `400 VALIDATION_ERROR` otherwise. The server cannot tell whether the owner allows embedding; the website falls back to a "Watch on YouTube" link in the browser (SYSTEM §85).

## `DELETE /api/livestream`

**204**.

---

# 21. Gallery Settings and Member Photos

## Types

```ts
type Photo = {
  id: string;
  thumbUrl: string;
  displayUrl: string;
  width: number; height: number;
  eventId?: string;
  uploaderType: 'MEMBER' | 'GUEST';
  uploaderName?: string;
  featured: boolean;
  createdAt: string;
};
```

`thumbUrl` and `displayUrl` are `MEDIA_BASE_URL + key`. The media domain serves R2 objects by key only, with no listing; keys contain a 128-bit random id, so URLs cannot be guessed (SYSTEM §42, DB-09). They are long-lived and browser-cacheable, which is the reason signed expiring URLs were not used.

## `GET /api/gallery/settings`

**200**

```ts
{
  galleryUrl: string;                   // what the QR code encodes
  guestViewEnabled: boolean;
  guestUploadEnabled: boolean;
  photosUsed: number;                   // published + reserved
  photoLimit: number;                   // 2000
  photosPurgedAt?: string;              // set once retention has run
}
```

The QR code is generated in the browser from `galleryUrl`; the server stores no image (SYSTEM §25).

## `PATCH /api/gallery/settings`

`{ guestViewEnabled?, guestUploadEnabled? }` → **200**.

## `GET /api/photos`

Filters: `eventId` (use `eventId=none` for "Other / Wedding Memories"), `featured=true`, `uploaderType`. Newest first, paginated (default 40).

## `PATCH /api/photos/:id`

`{ featured?, eventId? }` → **200** `Photo`. `409 FEATURED_LIMIT` when featuring a 13th photo.

## `DELETE /api/photos/:id`

**204**. Frees one slot.

---

# 22. Photo Upload Protocol

Used by members (`/api/photos/*`) and guests (`/api/public/gallery/:token/*`). The steps and shapes are identical; only authorization and limits differ.

```text
Browser                                API                              R2
  │ decode HEIC, make display + thumb    │                               │
  │── POST upload-requests ─────────────►│ validate, rate-limit,         │
  │                                      │ reserve slots, sign URLs      │
  │◄──────────────── upload tickets ─────│                               │
  │── PUT display, PUT thumb ───────────────────────────────────────────►│ staging/
  │── POST complete ────────────────────►│ verify bytes, copy to final,  │
  │                                      │ publish rows                  │
  │◄──────────────── per-photo results ──│                               │
```

## 22.1 `POST …/upload-requests`

```ts
{
  eventId?: string;
  uploaderName?: string;               // guests only, optional, ≤ 60
  photos: {                            // 1–30
    mimeType: 'image/jpeg' | 'image/webp' | 'image/png';   // after in-browser conversion
    displayBytes: number;              // ≤ 4 MB
    thumbBytes: number;                // ≤ 300 KB
    width: number; height: number;     // display image, longest side ≤ 2560
  }[];
}
```

Guests also send `X-Device-Id`.

The server checks, in order: access (session or gallery token with uploads enabled) → declared metadata → rate limits → **slot reservation** (`DATABASE_DESIGN.md` §9.3). Only then are URLs signed.

**200**

```ts
{
  uploads: {
    uploadId: string;
    displayPutUrl: string;              // presigned PUT, Content-Type bound
    thumbPutUrl: string;
  }[];                                   // same order as the request
  expiresAt: string;                     // 1 hour
}
```

Errors: `GALLERY_FULL` (with `remaining`), `UPLOADS_DISABLED`, `RATE_LIMITED`, `VALIDATION_ERROR`.

The 15 MB limit in the PRD applies to the file the guest **selects**. The browser rejects larger files before any request; the server only ever sees the resized derivatives.

## 22.2 Browser uploads

`PUT` each file to its URL with the declared `Content-Type`. A failed `PUT` can be retried with the same URL until `expiresAt`.

## 22.3 `POST …/complete`

`{ uploadIds: string[] }` (1–30) → **200**

```ts
{
  results: (
    | { uploadId: string; status: 'PUBLISHED'; photo: Photo }
    | { uploadId: string; status: 'FAILED'; reason: 'MISSING_OBJECT' | 'TOO_LARGE' | 'NOT_AN_IMAGE' | 'EXPIRED' }
    | { uploadId: string; status: 'UNKNOWN' }
  )[];
}
```

For each upload the server checks the staged objects' size and format signature, copies them to their final keys, and publishes the row (`DATABASE_DESIGN.md` §8). A `FAILED` upload releases its slot and its staging objects are deleted.

`UNKNOWN` means the upload id is not pending: it was already published, already failed, or never existed. If a `complete` response is lost and the client retries, already-published photos come back `UNKNOWN`; the client then refreshes the gallery. No photo is ever published twice.

The endpoint always returns **200** with per-photo results, so one bad photo in a batch of 30 does not fail the other 29.

## 22.4 `POST …/cancel`

`{ uploadIds: string[] }` → **204**. Releases slots for uploads the user abandoned (closed the picker, removed a photo). Uploads nobody cancels are released by the cleanup job after an hour.

## 22.5 Member vs guest

| | Member | Guest |
|---|---|---|
| Authorization | Session | Gallery token, `guestUploadEnabled` |
| Device and IP limits | No | Yes (§7) |
| `uploaderName` | Taken from the account | Optional, from the request |
| Slot reservation | Yes | Yes |

---

# 23. Cover Images

Wedding and event covers use the same direct-upload pattern without a database reservation.

## `POST /api/covers/upload-request`

`{ target: 'WEDDING' | 'EVENT'; eventId?: string; mimeType; bytes; width; height }` → **200** `{ ticket, putUrl, expiresAt }`.

`ticket` is a short-lived HMAC-signed value containing the wedding id, target and staging key. It replaces a database row: the server can trust it on `complete` because it signed it.

## `POST /api/covers/complete`

`{ ticket }` → **200** the updated `Wedding` or `Event`. Verifies the object, copies it to `weddings/{weddingId}/covers/`, sets `coverImageKey`, then deletes the previous cover.

## `DELETE /api/covers`

`{ target, eventId? }` as query parameters → **204**. Removes the cover and its object.

---

# 24. Public: Invitation and RSVP

No session. Access is possession of the invitation token.

## `GET /api/public/invite/:token`

Used by the invitation page to refresh when the guest returns to the tab. Neither this endpoint nor the server render of `/invite/:token` sets `linkOpenedAt`: link-preview bots (WhatsApp, iMessage) fetch the page without running scripts.

**200**

```ts
{
  wedding: {
    brideName: string; groomName: string; nameOrder: 'BRIDE_FIRST' | 'GROOM_FIRST';
    weddingDate: string;
    theme: 'CLASSIC' | 'MINIMAL' | 'MODERN';
    welcomeMessage?: string; coverImageUrl?: string;
  };
  guest: { name: string; maxPeople: number };
  events: {                              // only events this guest is invited to
    name: string; type: EventType; date: string;
    startTime?: string; endTime?: string;
    venue?: { name?: string; address?: string; mapUrl?: string };
    dressCode?: string;
  }[];
  rsvp: { status: RsvpStatus; attendingCount: number };
  rsvpDeadline?: string;
  rsvpLocked: boolean;
}
```

This is a **minimal projection**. It contains no ids, no other guests, no phone or email (not even the guest's own), no counts, and no gallery link. An empty `events` array is the "no events on your invitation right now" state (`DATABASE_DESIGN.md` §14.1).

## `POST /api/public/invite/:token/opened`

Sent once by the invitation page's script after it loads in a real browser. Sets `linkOpenedAt` on the first call only (conditional update, DATABASE_DESIGN §5.8); later calls change nothing. Body `{}`. **204**. Same-origin and JSON like every mutation; shares the public invitation GET rate limit (§7). Errors: `NOT_FOUND`, `RATE_LIMITED`.

## `POST /api/public/invite/:token/rsvp`

```ts
{ status: 'ATTENDING'; attendingCount: number } | { status: 'NOT_ATTENDING' }
```

**200** `{ rsvp: { status, attendingCount }, rsvpLocked }`. A guest cannot choose `PENDING`.

Errors: `CAPACITY_EXCEEDED` (with the current `maxPeople`, in case the family changed it), `RSVP_LOCKED`, `NO_EVENTS`, `RATE_LIMITED`, `NOT_FOUND`.

---

# 25. Public: Gallery

No session. Access is possession of the gallery token.

## `GET /api/public/gallery/:token`

**200**

```ts
{
  wedding: { brideName: string; groomName: string };
  albums: { eventId: string; name: string }[];   // events, for the upload picker and album filter
  viewEnabled: boolean;
  uploadEnabled: boolean;
  photosPurged: boolean;
}
```

## `GET /api/public/gallery/:token/photos`

Same query and pagination as `GET /api/photos`, minus `featured` and `uploaderType`. Returns `Photo` without `featured` and `uploaderType`. `409 CONFLICT` with message "Viewing is turned off" when `viewEnabled` is false; the page shows the upload option only.

## `POST /api/public/gallery/:token/upload-requests` · `…/complete` · `…/cancel`

§22, guest column.

---

# 26. Public: Member Invitation Preview

## `GET /api/public/member-invitations/:token`

Lets the invitation page show who invited whom before the person signs in or signs up.

**200**

```ts
{
  wedding: { brideName: string; groomName: string };
  invitedBy: string;                     // "Priya"
  email: string;                         // the invited address, to prefill signup
  role: 'ADMIN' | 'MANAGER';
  status: 'PENDING' | 'EXPIRED';
}
```

Revoked, accepted and unknown tokens return the same `404` (§4.4).

---

# 27. Internal Job Endpoints

Called by Vercel Cron with `Authorization: Bearer <CRON_SECRET>` (§2.3). Each is idempotent and safe to call more often than scheduled — which is what makes the V2 move to an external scheduler a configuration change (SYSTEM §54).

| Endpoint | Does | V1 schedule |
|---|---|---|
| `GET /api/internal/jobs/email` | Drains the email queue within today's allowance | Daily |
| `GET /api/internal/jobs/cleanup` | Expired upload reservations, orphaned staging objects, resuming `DELETING` weddings | Daily |
| `GET /api/internal/jobs/retention` | Photo retention (`DATABASE_DESIGN.md` §14.7) | Daily |

**200** `{ processed: number; remaining: number; durationMs: number }`. Each run stops before the function's time limit and leaves the rest for the next run.

---

# 28. Activity Log

## `GET /api/activity`

Admin. Newest first, paginated.

**200**

```ts
{
  items: {
    id: string;
    actor: { userId: string; name: string };
    action: string;                      // e.g. "guest.updated", DATABASE_DESIGN.md §5.15
    target: { type: string; id?: string; label: string };
    changes?: { field: string; before?: unknown; after?: unknown }[];
    meta?: Record<string, unknown>;
    createdAt: string;
  }[];
  nextCursor?: string;
}
```

There is no endpoint to modify or delete activity entries.

---

# 29. Guest Invitation Links: The Stable-Sharing Exception

Referenced by SYSTEM §22.

Session tokens, reset tokens and member invitation tokens are stored only as HMACs, so the server can never show them again. Guest invitation tokens are the exception: they are stored in plaintext, because a family shares an invitation link many times over several weeks — WhatsApp now, again when an uncle asks, again after a phone change — and must get the **same** link each time.

The exception is limited by these API rules:

1. **One endpoint returns the link:** `GET /api/guests/:id` (and the create and regenerate responses, which return the same `GuestDetail`). Lists, imports, exports, campaigns, activity entries and error details never include it.
2. **Members only.** No public endpoint returns any token.
3. **The public invitation response contains no token** — the guest already has it in their URL.
4. **Never logged.** Route logging records the route pattern, not the path (§8.2).
5. **Regenerable.** `POST /api/guests/:id/regenerate-link` replaces it at once, for a link that was forwarded too widely.
6. **`no-referrer`** on the invitation page, so the link does not leak to sites the guest clicks through to (§8.1).

**What this protects against:** a leaked guest list export, a shared screenshot of the guest table, or an application log revealing working invitation links. **What it does not protect against:** someone with read access to the database, who could read the tokens — accepted in SYSTEM §22 because they could equally read the guests' phone numbers.

---

# 30. Required API Tests

In addition to SYSTEM §91 and `DATABASE_DESIGN.md` §6.5:

```text
Every member endpoint returns 401 without a session.
Every Admin-only endpoint returns 403 for a Manager.
Every :id endpoint returns 404 for an id from another wedding (not 403).
A body containing weddingId, version or createdByUserId returns 400.
A mutating request without Origin, or from another origin, returns 403.
A mutating request with a non-JSON Content-Type returns 400.
PATCH with null clears the field; an omitted field is unchanged.
Login returns the same error for unknown email and wrong password.
Forgot-password returns 202 for unknown emails.
Signup with a member invitation and a different email creates no account.
Guest lists never contain inviteUrl.
Public invitation response contains no ids, phones, emails or other guests.
Invalid, regenerated and deleted-guest invitation tokens return identical 404 bodies.
RSVP above maxPeople returns 409 CAPACITY_EXCEEDED.
RSVP after the deadline returns 409 RSVP_LOCKED for guests but succeeds for members.
Member RSVP edit with a stale expectedVersion returns 409 VERSION_CONFLICT.
Upload-requests beyond remaining slots returns 409 GALLERY_FULL and issues no URLs.
Complete called twice publishes each upload once.
Creating the same email campaign twice queues each guest once.
Internal endpoints return 401 without the cron secret.
```

---

# 31. Decisions

Same format as SYSTEM §92.

## API-01: Wedding context is implicit
**Decision:** No wedding id in any member URL or body; it comes from the membership.
**Reason:** A value the client cannot send is a value that cannot be tampered with.
**Consequence:** Multiple weddings per user will need a "current wedding" in the session, not new URLs.

## API-02: No URL versioning
**Decision:** `/api/...`, not `/api/v1/...`.
**Reason:** The only client ships with the API.
**Consequence:** A public or mobile API later would get its own versioned prefix.

## API-03: 404, not 403, for other weddings' ids
**Decision:** Cross-wedding access is indistinguishable from a missing id.
**Reason:** A 403 confirms the id exists.
**Consequence:** Clients cannot tell "deleted" from "not yours"; they never need to.

## API-04: Strict schemas, null clears
**Decision:** Unknown fields are rejected; `null` in a `PATCH` clears a field.
**Reason:** Server-owned fields cannot be smuggled in, and there is one way to clear a value.
**Consequence:** Client forms must send only changed fields.

## API-05: Cursors for growing lists, full lists for bounded ones
**Decision:** Guests, tasks, expenses, photos and activity are cursor-paginated; the rest return everything.
**Reason:** Cursors do not skip or repeat items while a reception is uploading; bounded lists do not need the complexity.
**Consequence:** No "page 7 of 12" UI; lists load more on scroll.

## API-06: CSRF by SameSite, JSON and Origin
**Decision:** No CSRF token.
**Reason:** The three layers in §2.2 cover the same attacks with less machinery.
**Consequence:** Every mutating endpoint must be JSON; there are no form-encoded endpoints.

## API-07: Commands are POST sub-resources
**Decision:** `/publish`, `/resend`, `/regenerate-link`, `/delete` rather than patching status fields.
**Reason:** Each has side effects and permissions that a generic field update would hide.
**Consequence:** More routes, each with a single purpose.

## API-08: Server components call services directly
**Decision:** Pages render by calling services in the server, not by fetching the app's own API.
**Reason:** No extra network hop, no duplicate authentication, and the website and invitation pages load fast on budget phones.
**Consequence:** Services, not route handlers, are the real boundary; both paths must go through `ctx` and the tenant guard.

## API-09: The API hides storage shapes
**Decision:** `invitedEventIds: string[]` in the API, `invitedEvents: [{ eventId }]` in the database.
**Reason:** V1.1 can change storage without breaking clients.
**Consequence:** Each module has an explicit mapper from document to response.

## API-10: Tokens stay in page URLs
**Decision:** Invitation and gallery tokens are path segments.
**Reason:** They must be shareable links, and the pages are server-rendered from them.
**Consequence:** Vercel platform logs contain them; accepted (§8.2).

## API-11: Direct media URLs
**Decision:** Photo URLs are `MEDIA_BASE_URL + key`, not signed expiring URLs.
**Reason:** Cacheable and never expiring mid-scroll on a slow connection (SYSTEM §42).
**Consequence:** A photo URL shared outside the gallery keeps working until the photo is deleted.

---

# 32. Not in V1

- Public or third-party API, API keys, webhooks.
- Guest list export (CSV download) — not in the PRD; trivially added as `GET /api/guests/export`.
- Email change. (Account deletion is now in the PRD, §9.25 Account; its endpoint is not designed yet — see STATUS.md open decisions.)
- Real-time updates; clients refetch on focus and after their own mutations.
- Per-event RSVP endpoints (V1.1: `PUT /api/public/invite/:token/rsvp` with a per-event body).
- Idempotency keys on `POST` creates.
