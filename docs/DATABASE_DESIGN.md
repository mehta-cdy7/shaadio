# Shaadioo
## Database Design Document

**Version:** V1 (Document revision 1)
**Status:** Baseline — aligned with PRD revision 3 and SYSTEM_DESIGN revision 3
**Database:** MongoDB Atlas, accessed through Mongoose
**Scope:** Collections, fields, indexes, relationships, integrity rules, concurrency controls, deletion, migrations

---

# 0. How to Read This Document

This document turns `SYSTEM_DESIGN.md` into concrete data structures. It defines what is stored, where, in what shape, with which indexes, and which rules keep the data correct.

It does **not** define API request/response contracts (`API_DESIGN.md`) or folder structure.

Code snippets are **sketches** that show the exact query shape and filter conditions. They are the part to copy; surrounding error handling is omitted.

Order of authority when documents disagree: the PRD decides *what*, `SYSTEM_DESIGN.md` decides *how at system level*, this document decides *how data is shaped*. A disagreement is a defect to fix, not a choice to make locally.

---

# 1. Conventions

## 1.1 Naming

| Thing | Convention | Example |
|---|---|---|
| Collections | `snake_case`, plural | `wedding_memberships` |
| Fields | `camelCase` | `attendingCount` |
| Enum values | `UPPER_SNAKE` strings | `NOT_ATTENDING` |
| Money fields | suffix `Paise` | `amountPaise` |
| Reference fields | suffix `Id` / `Ids` | `eventId`, `eventIds` |

## 1.2 Identifiers

- `_id` is a MongoDB `ObjectId` on every collection except `rate_limits` and `schema_migrations`.
- The API serialises `ObjectId` as a string. The database never stores ids as strings.
- ObjectIds are **not secret**: they contain a timestamp and a counter, so neighbouring ids are predictable. Nothing that must be unguessable is derived from an ObjectId (§5.12, §11).

## 1.3 Instants (points in time)

`createdAt`, `updatedAt`, `expiresAt`, `sentAt`, `respondedAt` and similar are BSON `Date` values in UTC. Mongoose `timestamps: true` manages `createdAt` / `updatedAt`.

## 1.4 Calendar dates are strings

Dates that mean "a day on the calendar" are stored as `"YYYY-MM-DD"` strings, not as `Date`:

- `weddings.weddingDate`
- `weddings.rsvpDeadline`
- `events.date`
- `tasks.dueDate`
- `expenses.date`

**Why.** 14 December stored as "midnight IST" is `2026-12-13T18:30:00Z`. Any code that formats that instant in UTC — a server render, a log line, a CSV export — prints 13 December. A string has no timezone to get wrong, and ISO strings sort and compare correctly as plain strings (`"2026-12-14" > "2026-12-01"`).

"Today" for a wedding is computed in that wedding's timezone:

```ts
const todayIn = (tz: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date()); // "2026-12-14"
```

## 1.5 Event times are wall-clock strings

Event start and end times are stored as `"HH:mm"` strings, interpreted in `weddings.timezone`.

**Why not UTC instants.** The reception is at 8:00 PM in Dehradun. Stored as an instant, that is `14:30Z`. An NRI cousin in Toronto opens her invitation, her browser formats the instant in *her* timezone, and the card says **10:00 AM**. A wedding card must show venue time to every reader. Storing `"20:00"` makes 8:00 PM the only possible rendering.

An `endTime` earlier than `startTime` means the event ends the next day (sangeet `20:00`–`01:00`).

## 1.6 Money is integer paise

All amounts are whole paise stored as numbers: ₹12,45,000 is `124500000`.

- Integers avoid floating-point rounding in sums (`0.1 + 0.2 !== 0.3`).
- JavaScript numbers represent integers exactly up to 2⁵³ (≈ ₹90 lakh crore in paise), far beyond any wedding.
- Validation requires `Number.isInteger(value) && value > 0`.
- Conversion to rupees and Indian digit grouping happens only in the UI.

`Decimal128` was rejected: Mongoose returns it as an object that needs conversion everywhere, which is friction with no benefit for whole-paise values.

## 1.7 Phone numbers are normalised

Phones are stored in E.164 form (`+919876543210`), normalised on write. Without this, the CSV duplicate check cannot see that `98765 43210` and `+91-98765-43210` are the same number. A 10-digit number without a country code is assumed to be Indian (`+91`).

## 1.8 Emails are lowercased

Emails are trimmed and lowercased on write. Uniqueness and lookups rely on this.

## 1.9 Unset means absent, not null

An optional field that has no value is **absent** from the document. Clearing a field uses `$unset`, never `$set: null`.

This gives one way to ask "is it set?" (`{ field: { $exists: true } }`) instead of two (`absent` or `null`), which removes a class of filter bugs.

## 1.10 Secrets are never selected by default

Fields that hold secrets use Mongoose `select: false`:

- `users.passwordHash`
- `guests.inviteLink.token`
- `weddings.gallery.token`

They are returned only when a query asks for them explicitly (`.select('+inviteLink.token')`), which makes every read of a secret visible in code review.

## 1.11 Mongoose settings

| Setting | Value | Reason |
|---|---|---|
| `timestamps` | `true` | Managed `createdAt` / `updatedAt` |
| `versionKey` | `false` | Mongoose's `__v` only tracks array changes made through `save()`, which this codebase does not use. It would be mistaken for a real version. `guests.version` is explicit instead (§10). |
| Subdocument `_id` | `false` on embedded arrays | `invitedEvents` items do not need their own ids |
| `autoIndex` | `true` in development, `false` in production | See §17.2 |
| Reads | `.lean()` by default | Plain objects are faster and avoid accidental `save()` |
| Writes | Targeted `updateOne` / `$set` | `doc.save()` rewrites fields it did not change and loses concurrent updates (§10) |

## 1.12 String length limits

Enforced by Zod at the boundary and by `maxlength` in the schema.

| Field kind | Max |
|---|---|
| Person / couple name | 80 |
| Guest name (may be "Sharma Family, Ludhiana") | 120 |
| Event / vendor / task / expense title | 120–200 |
| Address | 300 |
| URL | 500 |
| Notes / description | 2,000 |
| Relationship label | 60 |
| Email | 254 |

---

# 2. Collection Catalogue

| # | Collection | Purpose | Tenant-scoped | Max per wedding | Removed by |
|---|---|---|---|---|---|
| 1 | `users` | Accounts | No | — | Not in V1 (§20) |
| 2 | `sessions` | Login sessions | No | — | TTL, logout, password reset |
| 3 | `password_resets` | Reset tokens | No | — | TTL, single use |
| 4 | `weddings` | Tenant root and its 1:1 settings | Root | 1 | Wedding deletion |
| 5 | `wedding_memberships` | User ↔ wedding, role | Yes | 25 | Member removal, wedding deletion |
| 6 | `member_invitations` | Invitations to join as a member | Yes | ~25 | Wedding deletion |
| 7 | `events` | Mehendi, sangeet, reception… | Yes | 30 | Hard delete |
| 8 | `guests` | One invitation (household), its RSVP | Yes | 1,000 | Hard delete |
| 9 | `tasks` | Planning tasks | Yes | Hundreds | Hard delete |
| 10 | `expenses` | Money spent or committed | Yes | Hundreds | Hard delete |
| 11 | `vendors` | Saved vendors | Yes | Dozens | Hard delete |
| 12 | `photos` | Published photo metadata | Yes | 2,000 | Delete, retention |
| 13 | `photo_uploads` | In-flight upload reservations | Yes | Transient | Publish or cleanup job |
| 14 | `email_jobs` | Bulk email queue | Yes | ~1 per guest per campaign | TTL 90 days after finishing |
| 15 | `activity_logs` | Append-only audit trail | Yes | Thousands | Wedding deletion |
| 16 | `rate_limits` | Rate-limit and quota counters | No | — | TTL |
| 17 | `schema_migrations` | Applied migrations | No | — | Never |

There is **no** `guest_invitations` collection. Invited events are embedded on the guest (ADR-17, §5.8).

---

# 3. Relationships

```text
users ─┬─ sessions
       ├─ password_resets
       └─ wedding_memberships (unique userId) ──► weddings
                                                   │  embeds: location, website,
                                                   │          gallery, livestream,
                                                   │          counters, uploadStats
                                                   │
          every collection below carries weddingId ▼
          ┌──────────────────────────────────────────────────────────┐
          │ member_invitations                                       │
          │ events ◄──────────────┬──────┬──────┬──────┬───────┐     │
          │ guests.invitedEvents[].eventId  │      │      │       │  │
          │ tasks.eventId? ─────────────────┘      │      │       │  │
          │ expenses.eventId? ─────────────────────┘      │       │  │
          │ vendors.eventIds[] ───────────────────────────┘       │  │
          │ photos.eventId? / photo_uploads.eventId? ─────────────┘  │
          │                                                          │
          │ expenses.vendorId? ──► vendors                           │
          │ tasks.assigneeUserId? ──► users (must be a member)       │
          │ email_jobs.guestId ──► guests                            │
          │ activity_logs.actor.userId ──► users (name denormalised) │
          └──────────────────────────────────────────────────────────┘
```

MongoDB enforces none of these references, so the application does. §7 lists what happens to each reference when its target is deleted, and §14.1 walks through deleting an event step by step.

## 3.1 Embed or reference

| Relationship | Choice | Why |
|---|---|---|
| Wedding → website, gallery, livestream settings, counters, location | Embed | 1:1, tiny, always read with the wedding |
| Guest → invited events | Embed array of `{ eventId }` | Bounded (≤ 30), always read with the guest, one write per guest (ADR-17) |
| Guest → RSVP, invite link, delivery status | Embed | 1:1 |
| Vendor → related events | Embed array of ids | Bounded (≤ 30) |
| Wedding → guests, events, tasks, expenses, vendors, photos | Reference (`weddingId` on the child) | Large or unbounded, queried and paginated independently |
| User → wedding | Reference through `wedding_memberships` | The role belongs to the relationship, not to either side; also keeps multi-wedding possible later (§5.5) |
| Activity entry → actor | Reference plus denormalised name | History must still read correctly after the member is removed |

**Rule of thumb:** embed when the data is 1:1 or small-and-bounded and always read with its parent. Reference when it can grow without limit or is queried on its own.

---

# 4. Tenant Scoping at a Glance

Every tenant-scoped collection has `weddingId: ObjectId` (required, immutable).

**Every compound index on a tenant-scoped collection starts with `weddingId`**, because every query starts with it (§6). The only indexes that do not are the ones used to *find* the tenant in the first place — token, slug and login lookups — listed in §6.3.

**Don't over-index.** A wedding has at most ~1,000 guests and 2,000 photos. Once a query is narrowed by `weddingId`, filtering a few hundred documents in memory is fast. Secondary index fields are added only where a query needs a **sort** at scale (photos) or where a lookup has no wedding context (tokens).

---

# 5. Collections

## 5.1 `users`

| Field | Type | Req | Notes |
|---|---|---|---|
| `email` | string | ✓ | Lowercased, unique |
| `passwordHash` | string | ✓ | `select: false`. Output of an established password-hashing library, including its parameters |
| `name` | string | ✓ | ≤ 80 |
| `lastLoginAt` | Date | | |
| `createdAt` / `updatedAt` | Date | ✓ | |

**Indexes**

| Index | Options | Used by |
|---|---|---|
| `{ email: 1 }` | unique | Login, signup, invitation matching |

**Rules**

- A user document has no `weddingId`. The link to a wedding is `wedding_memberships`.

## 5.2 `sessions`

| Field | Type | Req | Notes |
|---|---|---|---|
| `tokenHash` | string | ✓ | HMAC-SHA256 of the cookie token with `SESSION_SECRET` |
| `userId` | ObjectId | ✓ | |
| `lastSeenAt` | Date | ✓ | |
| `expiresAt` | Date | ✓ | TTL |
| `createdAt` | Date | ✓ | |

**Indexes**

| Index | Options | Used by |
|---|---|---|
| `{ tokenHash: 1 }` | unique | Every authenticated request |
| `{ userId: 1 }` | | Delete all sessions on password reset |
| `{ expiresAt: 1 }` | TTL, `expireAfterSeconds: 0` | Automatic cleanup |

**Rules**

- The cookie holds a random 256-bit token. The database holds only its HMAC, so a database leak cannot be replayed as a login.
- Lifetime is 30 days, sliding. `expiresAt` is extended only when `lastSeenAt` is more than 24 hours old, so a normal request does not cause a write.
- The session stores **no** `weddingId` or role. Membership is resolved on every request, which is why removing a member takes effect immediately (SYSTEM §10).
- TTL deletion runs about once a minute and is not exact, so the lookup also filters `expiresAt: { $gt: now }`.

## 5.3 `password_resets`

| Field | Type | Req | Notes |
|---|---|---|---|
| `userId` | ObjectId | ✓ | |
| `tokenHash` | string | ✓ | HMAC of the emailed token |
| `expiresAt` | Date | ✓ | 1 hour, TTL |
| `createdAt` | Date | ✓ | |

**Indexes:** `{ tokenHash: 1 }` unique · `{ userId: 1 }` · `{ expiresAt: 1 }` TTL.

**Rules**

- Issuing a new token deletes the user's earlier ones.
- Using a token is atomic and single-use by deleting it as it is read:

```ts
const reset = await PasswordReset.findOneAndDelete({
  tokenHash: hmac(token),
  expiresAt: { $gt: new Date() },
});
if (!reset) throw new InvalidOrExpired();
```

- A successful reset deletes all of that user's sessions.

## 5.4 `weddings`

The tenant root. Its 1:1 settings are embedded.

| Field | Type | Req | Notes |
|---|---|---|---|
| `status` | enum | ✓ | `ACTIVE` \| `DELETING` |
| `brideName` | string | ✓ | ≤ 80 |
| `groomName` | string | ✓ | ≤ 80 |
| `nameOrder` | enum | ✓ | `BRIDE_FIRST` \| `GROOM_FIRST`, default `BRIDE_FIRST` (PRD §9.2) |
| `title` | string | | ≤ 120 |
| `description` | string | | ≤ 2,000 |
| `weddingDate` | `"YYYY-MM-DD"` | ✓ | §1.4 |
| `timezone` | string | ✓ | IANA name, default `Asia/Kolkata` |
| `location` | object | ✓ | See below |
| `coverImageKey` | string | | R2 key |
| `rsvpDeadline` | `"YYYY-MM-DD"` | | Inclusive; RSVP locks when `todayIn(timezone) > rsvpDeadline` |
| `website` | object | ✓ | See below |
| `gallery` | object | ✓ | See below |
| `livestream` | object | | See below |
| `counters` | object | ✓ | Concurrency-controlled limits (§9) |
| `uploadStats` | object | ✓ | Diagnostic counts (SYSTEM §63) |
| `photosPurgedAt` | Date | | Set by the retention job (§14.7) |
| `deletionRequestedAt` | Date | | |
| `deletionRequestedBy` | ObjectId | | |
| `createdByUserId` | ObjectId | ✓ | |
| `createdAt` / `updatedAt` | Date | ✓ | |

`location`

| Field | Type | Req | Notes |
|---|---|---|---|
| `formattedAddress` | string | ✓ | |
| `city` | string | ✓ | Fallback for vendor search text |
| `state` | string | | |
| `country` | string | | Default `India` |
| `lat` / `lng` | number | | Present when chosen through Places autocomplete |
| `googlePlaceId` | string | | |

`website`

| Field | Type | Req | Notes |
|---|---|---|---|
| `slug` | string | ✓ | Unique, immutable after creation (§11) |
| `published` | boolean | ✓ | Default `false` |
| `publishedAt` | Date | | |
| `theme` | enum | ✓ | `CLASSIC` \| `MINIMAL` \| `MODERN`, default `CLASSIC` |
| `welcomeMessage` | string | | ≤ 1,000 |

`gallery`

| Field | Type | Req | Notes |
|---|---|---|---|
| `token` | string | ✓ | `select: false`, unique, 128-bit, never rotated (SYSTEM §25) |
| `guestViewEnabled` | boolean | ✓ | Default `true` |
| `guestUploadEnabled` | boolean | ✓ | Default `true` |

`livestream`

| Field | Type | Req | Notes |
|---|---|---|---|
| `youtubeVideoId` | string | ✓ | Extracted from any accepted URL form |
| `sourceUrl` | string | ✓ | As entered, for display in settings |

`counters` — see §9 for how each is written

| Field | Type | Default | Enforces |
|---|---|---|---|
| `adminCount` | int | 1 | At least one Admin |
| `photoSlotsUsed` | int | 0 | 2,000-photo cap (published + reserved) |
| `featuredPhotoCount` | int | 0 | 12-featured cap |

`uploadStats` — diagnostic only, `$inc` on each outcome, never used to enforce anything

| Field | Type | Default |
|---|---|---|
| `requested` | int | 0 |
| `published` | int | 0 |
| `failed` | int | 0 |

**Indexes**

| Index | Options | Used by |
|---|---|---|
| `{ 'website.slug': 1 }` | unique | Public website |
| `{ 'gallery.token': 1 }` | unique | Public gallery, QR |
| `{ status: 1 }` | | Deletion job resumes `DELETING` weddings |
| `{ weddingDate: 1 }` | | Retention job |

**Rules**

- Every access path checks `status: 'ACTIVE'`. A `DELETING` wedding is invisible to members, guests and the website from the moment deletion is requested.
- Settings are updated with targeted `$set` on the sub-path (`'gallery.guestUploadEnabled'`), never by replacing the whole sub-object.

## 5.5 `wedding_memberships`

| Field | Type | Req | Notes |
|---|---|---|---|
| `weddingId` | ObjectId | ✓ | |
| `userId` | ObjectId | ✓ | |
| `role` | enum | ✓ | `ADMIN` \| `MANAGER` |
| `label` | string | | "Bride's Father", display only, ≤ 60 |
| `joinedAt` | Date | ✓ | |
| `createdAt` / `updatedAt` | Date | ✓ | |

**Indexes**

| Index | Options | Used by |
|---|---|---|
| `{ userId: 1 }` | **unique** | Resolving the current wedding; **enforces PRD Rule 1** (one wedding per user) |
| `{ weddingId: 1, role: 1 }` | | Member list, admin checks |

**Rules**

- The unique `userId` index *is* the one-wedding rule. Two simultaneous invitation acceptances for the same user cannot both succeed.
- Removal deletes the document; history is in `activity_logs`.
- Changing an Admin's role or removing an Admin goes through `counters.adminCount` (§9.2).
- **Reversibility:** allowing multiple weddings per user later means replacing `{ userId: 1 }` unique with `{ userId: 1, weddingId: 1 }` unique and adding a "current wedding" choice to the session. No document changes.

## 5.6 `member_invitations`

| Field | Type | Req | Notes |
|---|---|---|---|
| `weddingId` | ObjectId | ✓ | |
| `email` | string | ✓ | Lowercased |
| `role` | enum | ✓ | `ADMIN` \| `MANAGER` |
| `label` | string | | |
| `tokenHash` | string | ✓ | HMAC of the emailed token |
| `status` | enum | ✓ | `PENDING` \| `ACCEPTED` \| `REVOKED` |
| `invitedByUserId` | ObjectId | ✓ | |
| `expiresAt` | Date | ✓ | 7 days |
| `acceptedAt` | Date | | |
| `acceptedByUserId` | ObjectId | | |
| `createdAt` / `updatedAt` | Date | ✓ | |

**Indexes**

| Index | Options | Used by |
|---|---|---|
| `{ tokenHash: 1 }` | unique | Accepting |
| `{ weddingId: 1, email: 1 }` | unique, partial `{ status: 'PENDING' }` | At most one pending invitation per email per wedding |
| `{ weddingId: 1, status: 1 }` | | Pending list in settings |

**Rules**

- "Expired" is computed from `expiresAt`, not stored as a status. Nothing has to run to flip it.
- **Resend** writes a new `tokenHash` and `expiresAt` on the same document, so the old link stops working.
- Acceptance is a transaction (§8): conditionally move `PENDING → ACCEPTED` where `expiresAt > now`, then insert the membership. If the user already has a membership, the unique index rejects the insert and the transaction aborts.

## 5.7 `events`

| Field | Type | Req | Notes |
|---|---|---|---|
| `weddingId` | ObjectId | ✓ | |
| `name` | string | ✓ | ≤ 80 |
| `type` | enum | ✓ | `ROKA` \| `ENGAGEMENT` \| `MEHENDI` \| `HALDI` \| `SANGEET` \| `COCKTAIL` \| `WEDDING` \| `RECEPTION` \| `CUSTOM` |
| `date` | `"YYYY-MM-DD"` | ✓ | |
| `startTime` | `"HH:mm"` | | Wall-clock, §1.5 |
| `endTime` | `"HH:mm"` | | Earlier than `startTime` = next day |
| `venue` | object | | `{ name, address, mapUrl }`, all optional; absent venue shows "To be announced" |
| `description` | string | | ≤ 2,000 |
| `dressCode` | string | | ≤ 200 |
| `coverImageKey` | string | | |
| `createdByUserId` | ObjectId | ✓ | |
| `createdAt` / `updatedAt` | Date | ✓ | |

**Indexes:** `{ weddingId: 1, date: 1, startTime: 1 }`.

**Rules**

- Sorting by `date` then `startTime` is chronological because both are fixed-width strings. An event with no `startTime` sorts first within its day ("time to be announced").
- Upcoming events: `date >= todayIn(wedding.timezone)`.
- **Hard delete** with the cascade in §14.1. There is no archived or "active" flag.
- Maximum 30 events per wedding.

## 5.8 `guests`

One guest document is one invitation — "Rajesh Sharma" or "Sharma Family" — not one person.

| Field | Type | Req | Notes |
|---|---|---|---|
| `weddingId` | ObjectId | ✓ | |
| `name` | string | ✓ | ≤ 120 |
| `side` | enum | | `BRIDE` \| `GROOM` \| `BOTH` |
| `email` | string | | Lowercased |
| `phone` | string | | E.164 |
| `maxPeople` | int | ✓ | 1–20 |
| `invitedEvents` | array | ✓ | `[{ eventId }]`, default `[]`, ≤ 30, subdocument `_id: false` |
| `rsvp` | object | ✓ | See below |
| `inviteLink` | object | ✓ | See below |
| `delivery` | object | | `{ sentAt, sentVia }`, `sentVia`: `EMAIL` \| `WHATSAPP` \| `MANUAL` |
| `notes` | string | | ≤ 2,000 |
| `version` | int | ✓ | Default 0, incremented on every write (§10) |
| `createdByUserId` | ObjectId | ✓ | |
| `createdAt` / `updatedAt` | Date | ✓ | |

`rsvp` — the single V1 answer (ADR-13)

| Field | Type | Req | Notes |
|---|---|---|---|
| `status` | enum | ✓ | `PENDING` \| `ATTENDING` \| `NOT_ATTENDING`, default `PENDING` |
| `attendingCount` | int | ✓ | Default 0 |
| `respondedAt` | Date | | |
| `respondedVia` | enum | | `GUEST_LINK` \| `MEMBER` |

`inviteLink`

| Field | Type | Req | Notes |
|---|---|---|---|
| `token` | string | ✓ | `select: false`, unique, 128-bit, plaintext under the stable-sharing exception (SYSTEM §22) |
| `issuedAt` | Date | ✓ | Reset on regeneration |
| `firstOpenedAt` | Date | | Set once, the first time the link is opened |

**Why `invitedEvents` holds objects, not bare ids.** `[{ eventId }]` looks redundant today. It exists so that per-event RSVP in V1.1 is "add `rsvpStatus` and `attendingCount` to each item" — a single-statement migration (§17.4) — instead of a change in the array's type.

**Indexes**

| Index | Options | Used by |
|---|---|---|
| `{ 'inviteLink.token': 1 }` | unique | Public invitation page (no wedding context yet) |
| `{ weddingId: 1, name: 1 }` | | Guest list sorted by name, and every other scoped guest query |
| `{ weddingId: 1, 'invitedEvents.eventId': 1 }` | multikey | Filter by event, event-delete cascade |
| `{ weddingId: 1, phone: 1 }` | | Duplicate-phone detection during import |

Filters on `side`, `rsvp.status` and `delivery.sentAt` use the `weddingId` prefix and filter the remaining ≤ 1,000 documents; they do not get their own indexes (§4).

**Invariants**

| Invariant | Enforced by |
|---|---|
| `rsvp.attendingCount <= maxPeople` | Conditional update filters (§10) |
| `rsvp.status === 'ATTENDING'` ⇔ `attendingCount >= 1` | Service validation |
| `rsvp.status !== 'ATTENDING'` ⇒ `attendingCount === 0` | Service validation |
| `invitedEvents` has no duplicate `eventId` | Service validation (`$addToSet` when adding) |
| Every `invitedEvents.eventId` belongs to the same wedding | Cross-reference check on write (§6.4) |

**Rules**

- The RSVP answer applies to every invited event. Per-event headcount is derived (§13.2).
- `rsvp.respondedVia` is what the PRD §15 pilot metric ("% of guests who RSVP through the link") is computed from.
- `inviteLink.firstOpenedAt` is set with a conditional update (`{ 'inviteLink.firstOpenedAt': { $exists: false } }`), so it costs one write per guest ever. It gives the family an "opened but not replied" list, which is more useful than a plain "pending" list.
- Regenerating the link replaces `token` and `issuedAt` and clears `firstOpenedAt`; the old link stops working immediately.
- Maximum 1,000 guests per wedding (soft, §15).

## 5.9 `tasks`

| Field | Type | Req | Notes |
|---|---|---|---|
| `weddingId` | ObjectId | ✓ | |
| `title` | string | ✓ | ≤ 200 |
| `description` | string | | ≤ 2,000 |
| `assigneeUserId` | ObjectId | | Must be a current member of the same wedding |
| `eventId` | ObjectId | | Same wedding |
| `dueDate` | `"YYYY-MM-DD"` | | |
| `priority` | enum | ✓ | `LOW` \| `MEDIUM` \| `HIGH`, default `MEDIUM` |
| `status` | enum | ✓ | `TODO` \| `IN_PROGRESS` \| `DONE`, default `TODO` |
| `completedAt` | Date | | Set on `→ DONE`, unset when reopened |
| `createdByUserId` | ObjectId | ✓ | |
| `createdAt` / `updatedAt` | Date | ✓ | |

**Indexes:** `{ weddingId: 1, status: 1, dueDate: 1 }` · `{ weddingId: 1, assigneeUserId: 1, status: 1 }` ("My Tasks").

The assignee is a `userId`, not a membership id, because "My Tasks" starts from the session's `userId`.

## 5.10 `expenses`

| Field | Type | Req | Notes |
|---|---|---|---|
| `weddingId` | ObjectId | ✓ | |
| `title` | string | ✓ | ≤ 200 |
| `amountPaise` | int | ✓ | > 0, ≤ 10¹² (sanity cap) |
| `date` | `"YYYY-MM-DD"` | ✓ | |
| `category` | enum | ✓ | `VENUE` \| `CATERING` \| `PHOTOGRAPHY` \| `VIDEOGRAPHY` \| `DECORATION` \| `CLOTHING` \| `JEWELLERY` \| `ENTERTAINMENT` \| `INVITATIONS` \| `GIFTS` \| `TRAVEL` \| `MAKEUP` \| `MISCELLANEOUS` |
| `paidBy` | string | | Free text, ≤ 80 ("Papa", "Groom's family") |
| `eventId` | ObjectId | | Same wedding |
| `vendorId` | ObjectId | | Same wedding |
| `notes` | string | | ≤ 2,000 |
| `createdByUserId` | ObjectId | ✓ | |
| `createdAt` / `updatedAt` | Date | ✓ | |

**Indexes:** `{ weddingId: 1, date: -1 }` · `{ weddingId: 1, vendorId: 1 }` (vendor totals and vendor-delete cascade).

## 5.11 `vendors`

| Field | Type | Req | Notes |
|---|---|---|---|
| `weddingId` | ObjectId | ✓ | |
| `name` | string | ✓ | ≤ 120 |
| `category` | enum | ✓ | `PHOTOGRAPHER` \| `VIDEOGRAPHER` \| `VENUE` \| `CATERER` \| `DECORATOR` \| `DJ` \| `MAKEUP_ARTIST` \| `MEHENDI_ARTIST` \| `PANDIT` \| `CHOREOGRAPHER` \| `FLORIST` \| `WEDDING_PLANNER` \| `TRANSPORT` \| `OTHER` |
| `source` | enum | ✓ | `MANUAL` \| `GOOGLE` |
| `googlePlaceId` | string | | Present when `source = GOOGLE` |
| `contactPerson` | string | | |
| `phone` | string | | E.164 |
| `email` | string | | |
| `address` | string | | ≤ 300 |
| `website` | string | | ≤ 500 |
| `agreedCostPaise` | int | | |
| `eventIds` | ObjectId[] | ✓ | Default `[]`, ≤ 30 |
| `notes` | string | | ≤ 2,000 |
| `createdByUserId` | ObjectId | ✓ | |
| `createdAt` / `updatedAt` | Date | ✓ | |

**Indexes**

| Index | Options | Used by |
|---|---|---|
| `{ weddingId: 1, category: 1 }` | | Vendor list |
| `{ weddingId: 1, googlePlaceId: 1 }` | unique, partial `{ googlePlaceId: { $type: 'string' } }` | Prevents adding the same Google business twice |

**Rules**

- Google details are copied once when the vendor is added (ADR-14) and are editable afterwards. Rating is not copied: it changes over time and a stale rating is misleading.
- `eventIds` is a plain id array (unlike `guests.invitedEvents`) because no per-item data is planned for it.

## 5.12 `photos`

Only **published** photos live here. In-flight uploads are in `photo_uploads`.

| Field | Type | Req | Notes |
|---|---|---|---|
| `weddingId` | ObjectId | ✓ | |
| `eventId` | ObjectId | | Absent = "Other / Wedding Memories" album |
| `displayKey` | string | ✓ | R2 key, ≤ 2560 px |
| `thumbKey` | string | ✓ | R2 key |
| `width` / `height` | int | ✓ | Of the display image, for layout without loading it |
| `displayBytes` / `thumbBytes` | int | ✓ | |
| `mimeType` | enum | ✓ | `image/jpeg` \| `image/webp` \| `image/png` |
| `uploaderType` | enum | ✓ | `MEMBER` \| `GUEST` |
| `uploaderUserId` | ObjectId | | Members |
| `uploaderName` | string | | Guests, optional, ≤ 60 |
| `featured` | boolean | ✓ | Default `false` |
| `featuredAt` | Date | | |
| `createdAt` / `updatedAt` | Date | ✓ | |

**Object keys** (every R2 object that belongs to a wedding)

```text
weddings/{weddingId}/photos/{keyId}/d.webp     display
weddings/{weddingId}/photos/{keyId}/t.webp     thumbnail
weddings/{weddingId}/covers/{keyId}.webp       wedding and event cover images
staging/{weddingId}/{keyId}/d                  before verification
staging/{weddingId}/{keyId}/t
```

- Cover images (`weddings.coverImageKey`, `events.coverImageKey`) live under `covers/`, not `photos/`, so the photo retention job (§14.7) leaves the website's covers in place. Replacing a cover deletes the old object after the new key is saved; deleting an event deletes its cover (§14.1).

- `keyId` is a fresh 128-bit random value (base64url), **never** the photo's ObjectId. Photos are served from unguessable URLs (SYSTEM §42), and ObjectIds are predictable from their neighbours.
- The `weddings/{weddingId}/` prefix means a wedding's objects can be deleted by prefix even if metadata rows are missing.
- The `staging/` prefix is separate so cleanup can target it and an R2 lifecycle rule can expire it as a backstop (§12).

**Indexes**

| Index | Options | Used by |
|---|---|---|
| `{ weddingId: 1, createdAt: -1, _id: -1 }` | | Gallery cursor pagination |
| `{ weddingId: 1, eventId: 1, createdAt: -1, _id: -1 }` | | Album view |
| `{ weddingId: 1, featuredAt: -1 }` | partial `{ featured: true }` | Website glimpse |

## 5.13 `photo_uploads`

One document per photo between "upload URL issued" and "published". Each document holds one reserved slot of the 2,000-photo cap.

| Field | Type | Req | Notes |
|---|---|---|---|
| `weddingId` | ObjectId | ✓ | |
| `uploaderType` | enum | ✓ | `MEMBER` \| `GUEST` |
| `uploaderUserId` | ObjectId | | |
| `uploaderName` | string | | |
| `deviceIdHash` | string | | HMAC of the guest's browser device id |
| `eventId` | ObjectId | | |
| `keyId` | string | ✓ | Pre-generated; becomes the final key id |
| `stagingDisplayKey` / `stagingThumbKey` | string | ✓ | |
| `declared` | object | ✓ | `{ mimeType, displayBytes, thumbBytes, width, height }` as the client claimed; verified before publishing |
| `expiresAt` | Date | ✓ | `createdAt` + 1 hour |
| `createdAt` | Date | ✓ | |

**Indexes:** `{ weddingId: 1, createdAt: 1 }` · `{ expiresAt: 1 }` (**not** TTL).

**Why `expiresAt` is not a TTL index.** A TTL index would delete the document silently. The reserved slot in `counters.photoSlotsUsed` would never be released and the staging objects would stay in R2. Expired reservations are handled by the cleanup job, which deletes the staging objects, deletes the document and releases the slot together (§14.6).

**Why a separate collection.** If pending uploads were `photos` rows with a `status`, every gallery query would need `status: 'PUBLISHED'`, which is exactly the forgettable second filter that hard-delete avoids for events. Keeping `photos` published-only means the gallery query is just `{ weddingId }`.

## 5.14 `email_jobs`

| Field | Type | Req | Notes |
|---|---|---|---|
| `weddingId` | ObjectId | ✓ | |
| `campaignId` | ObjectId | ✓ | Groups one "send to all" action, for progress display |
| `kind` | enum | ✓ | `GUEST_INVITATION` \| `RSVP_REMINDER` |
| `guestId` | ObjectId | ✓ | |
| `toEmail` | string | ✓ | Snapshot; refreshed from the guest at send time |
| `status` | enum | ✓ | `PENDING` \| `PROCESSING` \| `SENT` \| `FAILED` \| `CANCELLED` |
| `attempts` | int | ✓ | Default 0, max 3 |
| `claimId` | string | | Set when a worker run claims the job (see below) |
| `lockedUntil` | Date | | Claim lease, 5 minutes |
| `lastAttemptAt` | Date | | |
| `lastError` | string | | ≤ 500 |
| `providerMessageId` | string | | |
| `sentAt` | Date | | |
| `idempotencyKey` | string | ✓ | `"{campaignId}:{guestId}"`, unique |
| `purgeAt` | Date | | Set to finish time + 90 days; TTL |
| `createdByUserId` | ObjectId | ✓ | |
| `createdAt` / `updatedAt` | Date | ✓ | |

**Indexes**

| Index | Options | Used by |
|---|---|---|
| `{ idempotencyKey: 1 }` | unique | Same guest cannot be queued twice in one campaign |
| `{ status: 1, createdAt: 1 }` | | Worker claim — **global**, not wedding-scoped (§6.3) |
| `{ weddingId: 1, campaignId: 1, status: 1 }` | | "120 of 300 sent" |
| `{ weddingId: 1, guestId: 1 }` | | Cancel on guest delete |
| `{ purgeAt: 1 }` | TTL, `expireAfterSeconds: 0` | Remove finished jobs |

**Claiming a batch** (SYSTEM §53). `updateMany` cannot take a limit, so the worker selects candidates, claims them conditionally, then reads back only what it actually won:

```ts
const now = new Date();
const claimId = randomId();
const claimable = {
  $or: [
    { status: 'PENDING' },
    { status: 'PROCESSING', lockedUntil: { $lt: now } }, // lease expired: a previous run died
  ],
};

const candidates = await EmailJob.collection
  .find(claimable, { projection: { _id: 1 } })
  .sort({ createdAt: 1 })
  .limit(allowance)            // today's remaining quota minus the transactional reserve
  .toArray();

await EmailJob.collection.updateMany(
  { _id: { $in: candidates.map(c => c._id) }, ...claimable },   // re-checked: another run may have won
  { $set: { status: 'PROCESSING', claimId, lockedUntil: addMinutes(now, 5) }, $inc: { attempts: 1 } },
);

const mine = await EmailJob.collection.find({ claimId }).toArray();
```

**Rules**

- Transactional emails (password reset, member invitation, single guest invitation) are **not** jobs (SYSTEM §46).
- At send time the worker re-reads the guest. If the guest is gone or has no email, the job becomes `CANCELLED`. Otherwise it sends to the guest's current email.
- On success the guest's `delivery` is set to `{ sentAt, sentVia: 'EMAIL' }`.
- After 3 failed attempts the job is `FAILED` and shown to members with a retry action.

## 5.15 `activity_logs`

| Field | Type | Req | Notes |
|---|---|---|---|
| `weddingId` | ObjectId | ✓ | |
| `actor` | object | ✓ | `{ userId, name }` — name denormalised |
| `action` | enum | ✓ | See below |
| `target` | object | ✓ | `{ type, id?, label }`, label ≤ 120 |
| `changes` | array | | `[{ field, before, after }]`, ≤ 50 items, edits only |
| `meta` | object | | e.g. `{ count: 142 }` for an import, `{ affectedGuests: 38, leftWithNoEvents: 3 }` for an event delete |
| `createdAt` | Date | ✓ | No `updatedAt`: entries never change |

**Actions**

```text
member.invited        member.joined        member.removed       member.role_changed
guest.created         guest.updated        guest.deleted        guest.imported
guest.link_regenerated
expense.created       expense.updated      expense.deleted
event.deleted         photo.deleted
website.published     website.unpublished
```

**Indexes:** `{ weddingId: 1, createdAt: -1, _id: -1 }`.

**Rules**

- **Append-only.** No repository exposes update or delete. Schema middleware throws on any update or delete operation against this model; the only deletion path is the wedding-deletion job, which uses the native collection (§6.3).
- **Written in the same transaction as the change it records** (§8), so a change that commits is always logged and a log entry never describes a change that rolled back.
- `changes` never contains tokens, password hashes or the gallery token. Guest phone and email changes are logged; they are deleted with the wedding like all guest data.

## 5.16 `rate_limits`

| Field | Type | Req | Notes |
|---|---|---|---|
| `_id` | string | ✓ | HMAC of `"{scope}:{key}:{windowStart}"` |
| `count` | int | ✓ | |
| `expiresAt` | Date | ✓ | End of the window; TTL |

**Index:** `{ expiresAt: 1 }` TTL.

**Pattern**

```ts
const doc = await RateLimit.findOneAndUpdate(
  { _id: hmac(`${scope}:${key}:${windowStart}`) },
  { $inc: { count: 1 }, $setOnInsert: { expiresAt: windowEnd } },
  { upsert: true, new: true },
);
if (doc.count > limit) throw new RateLimited();
```

Two first requests in the same window can race on the upsert; on a duplicate-key error, retry once.

**Scopes**

| Scope | Key | Limit |
|---|---|---|
| `login` | email; IP | Per SYSTEM §67 |
| `signup` | IP | |
| `forgot` | email | |
| `rsvp` | invitation | 20 / 15 min |
| `rsvp-global` | — | 300 / min |
| `upload-device` | device id hash | 150 / day |
| `upload-ip` | IP | Generous ceiling (SYSTEM §97) |
| `vendor-search` | userId | |
| `email-day` | UTC date | Counts **every** email sent, transactional and bulk; the worker's allowance is `dailyQuota − reserve − count` |

## 5.17 `schema_migrations`

| Field | Type | Notes |
|---|---|---|
| `_id` | string | Migration file name, e.g. `0004_guest_phone_e164` |
| `appliedAt` | Date | |
| `durationMs` | int | |

---

# 6. Tenant Isolation in the Data Layer

## 6.1 The rule

Every query on a tenant-scoped collection filters by `weddingId`, and that `weddingId` comes from the resolved membership — or from the document a public token resolved to. Never from the request body, query string or URL path.

## 6.2 Tenant guard

Remembering the filter is not a strategy. A Mongoose plugin on every tenant-scoped model makes a query **without** `weddingId` throw:

```ts
// src/server/db/tenant-guard.ts — sketch
const QUERY_OPS = [
  'find', 'findOne', 'findOneAndUpdate', 'findOneAndDelete',
  'updateOne', 'updateMany', 'deleteOne', 'deleteMany',
  'countDocuments', 'replaceOne',
] as const;

export function tenantGuard(schema: Schema) {
  schema.pre(QUERY_OPS, function () {
    if (this.getFilter().weddingId === undefined) {
      throw new Error(`Unscoped ${this.op} on ${this.model.modelName}`);
    }
  });

  schema.pre('aggregate', function () {
    const first = this.pipeline()[0] as any;
    if (first?.$match?.weddingId === undefined) {
      throw new Error('Unscoped aggregate: first stage must $match weddingId');
    }
  });
}
```

Consequences:

- `Guest.findById(id)` throws, which forces `Guest.findOne({ _id: id, weddingId })`. This is the intended effect.
- Inserts are covered by `weddingId` being `required` in every tenant schema.
- Middleware registration details vary between Mongoose versions. The test in §6.5 is what proves the guard works, not this sketch.

**Applied to:** `wedding_memberships`, `member_invitations`, `events`, `guests`, `tasks`, `expenses`, `vendors`, `photos`, `photo_uploads`, `email_jobs`, `activity_logs`.

**Not applied to:** `users`, `sessions`, `password_resets`, `rate_limits`, `schema_migrations` (not tenant data), and `weddings` (always addressed by its own `_id`).

## 6.3 Unscoped access points

Some lookups happen **before** the wedding is known — they are how the wedding is found. These use the native driver collection (`Model.collection`), which bypasses Mongoose middleware, and they live in **one module**, `src/server/db/unscoped.ts`. A lint rule forbids `.collection.` anywhere else.

| # | Access | Collection | Looks up by | Then |
|---|---|---|---|---|
| 1 | Resolve current wedding | `wedding_memberships` | `userId` | Continue scoped with its `weddingId` |
| 2 | Accept member invitation | `member_invitations` | `tokenHash` | Scoped by its `weddingId` |
| 3 | Public invitation page | `guests` | `inviteLink.token` | Scoped by its `weddingId`; check wedding `ACTIVE` |
| 4 | Public website | `weddings` | `website.slug` | Check `published` and `ACTIVE` |
| 5 | Public gallery | `weddings` | `gallery.token` | Check `ACTIVE` and view/upload switches |
| 6 | Email worker claim | `email_jobs` | `status` | Each job carries its `weddingId` |
| 7 | Upload cleanup | `photo_uploads` | `expiresAt` | Each carries its `weddingId` |
| 8 | Deletion and retention jobs | all tenant collections | `weddingId` from a `DELETING` or expired wedding | — |
| 9 | Migrations | any | — | Run by an operator, never by the app |

This table **is** the audit list. Reviewing tenant isolation means reviewing these nine functions plus the guard test.

## 6.4 Cross-reference validation on write

A write that references another document verifies the reference belongs to the **same** wedding. Without this, a member of Wedding A could attach a task to Wedding B's event id.

```ts
// single reference
if (eventId && !(await Event.exists({ _id: eventId, weddingId }))) throw new NotFound('event');

// array of references
const found = await Event.countDocuments({ _id: { $in: eventIds }, weddingId });
if (found !== new Set(eventIds.map(String)).size) throw new NotFound('event');
```

Applies to: `invitedEvents.eventId`, `tasks.eventId`, `tasks.assigneeUserId` (checked against memberships), `expenses.eventId`, `expenses.vendorId`, `vendors.eventIds`, `photos.eventId`, `photo_uploads.eventId`.

## 6.5 Required tests

In addition to SYSTEM §91:

```text
For every tenant-scoped model: an operation without weddingId throws.
For every tenant-scoped model: an aggregate not starting with $match weddingId throws.
A task cannot reference another wedding's event.
A guest cannot be invited to another wedding's event.
An expense cannot reference another wedding's vendor.
A task cannot be assigned to a user who is not a member of the wedding.
```

---

# 7. Referential Integrity

MongoDB does not cascade. Every reference has an explicit rule for when its target is deleted.

| Reference | When the target is deleted |
|---|---|
| `guests.invitedEvents[].eventId` → event | `$pull` the item |
| `tasks.eventId` → event | `$unset` |
| `expenses.eventId` → event | `$unset` |
| `vendors.eventIds[]` → event | `$pull` |
| `photos.eventId` → event | `$unset` (photo moves to "Other") |
| `photo_uploads.eventId` → event | `$unset` |
| Event's own cover image (R2 object) | Deleted after commit (§14.1) |
| `expenses.vendorId` → vendor | `$unset` (an expense without a vendor is valid) |
| `tasks.assigneeUserId` → member removed | `$unset` (task becomes unassigned) |
| `email_jobs.guestId` → guest | `PENDING` jobs → `CANCELLED` |
| `activity_logs.actor.userId` → member removed | Nothing; the denormalised name keeps the entry readable |
| Everything → wedding | Wedding deletion job (§14.6) |

The operations are in §14.

---

# 8. Transactions

Used where several writes must succeed or fail together. All use `session.withTransaction()`, which retries transient errors automatically.

| Operation | Writes | Why atomic |
|---|---|---|
| Create wedding | Wedding + first Admin membership | A wedding with no Admin is unrecoverable |
| Accept member invitation | Invitation → `ACCEPTED` + membership insert | Neither without the other |
| Change / remove an Admin | Membership + `counters.adminCount` + activity log | Last-Admin rule (§9.2) |
| Remove a member | Membership delete + unassign tasks + activity log | |
| Delete event | Event + all cascades in §14.1 + activity log | No dangling event ids |
| Delete guest | Guest + cancel pending jobs + activity log | No email to a deleted guest |
| Delete vendor | Vendor + unset `expenses.vendorId` | |
| Publish photo | Insert photo + delete its `photo_uploads` doc | Slot carries over exactly once |
| Delete photo | Photo + counters + activity log | Counter stays exact |
| Feature / unfeature photo | Photo + `counters.featuredPhotoCount` | 12-featured cap |
| Any other logged mutation | The change + its activity log entry | SYSTEM §96 |

**Two rules for every transaction**

1. **Never call R2, Resend or Google inside a transaction.** External calls are slow and cannot be rolled back. Do the external work first and record it in a transaction (publish photo), or commit first and do external cleanup after (delete photo).
2. **Keep them small.** A transaction that touches all 1,000 guests (event delete) is fine. The whole-wedding deletion is not a transaction; it is an idempotent, resumable sequence (§14.6).

---

# 9. Stored Counters and Invariants

## 9.1 The rule

**A number is stored only if it enforces a limit under concurrency.** Every number shown on the dashboard is computed on read (§13).

There are exactly three stored counters, all in `weddings.counters`: `adminCount`, `photoSlotsUsed`, `featuredPhotoCount`. `uploadStats` is diagnostic and enforces nothing.

## 9.2 `adminCount` — why counting in a transaction is not enough

Two Admins, Priya and Arjun, open Settings at the same moment. Priya demotes Arjun; Arjun demotes Priya.

With a naive transaction, each one counts Admins (sees 2), each updates a **different** membership document, and both commit. MongoDB's snapshot isolation only detects conflicts when two transactions write the **same** document. The wedding now has zero Admins. This anomaly is called *write skew*.

Making every Admin change also write the same wedding document forces the conflict: one transaction gets a `WriteConflict`, retries, sees `adminCount: 1`, and fails the condition.

```ts
await session.withTransaction(async () => {
  const demoted = await Membership.updateOne(
    { weddingId, userId: targetUserId, role: 'ADMIN' },
    { $set: { role: 'MANAGER' } },
    { session },
  );
  if (demoted.modifiedCount === 0) throw new NotFound('admin');

  const counted = await Wedding.updateOne(
    { _id: weddingId, 'counters.adminCount': { $gt: 1 } },
    { $inc: { 'counters.adminCount': -1 } },
    { session },
  );
  if (counted.modifiedCount === 0) throw new Conflict('LAST_ADMIN'); // aborts both writes

  await ActivityLog.create([{ /* member.role_changed */ }], { session });
});
```

Promoting to Admin increments in the same way. Removing an Admin decrements.

## 9.3 `photoSlotsUsed` — the 2,000-photo cap

Counts published photos **plus** reserved uploads. Reserved *before* upload URLs are issued (SYSTEM §97):

```ts
const reserved = await Wedding.updateOne(
  { _id: weddingId, status: 'ACTIVE', 'counters.photoSlotsUsed': { $lte: PHOTO_LIMIT - n } },
  { $inc: { 'counters.photoSlotsUsed': n } },
);
if (reserved.modifiedCount === 0) throw new Conflict('GALLERY_FULL'); // no URLs issued
```

| Event | Change to `photoSlotsUsed` |
|---|---|
| Upload request for n photos | +n (conditional, above) |
| Photo published | 0 (the reserved slot becomes a used slot) |
| Upload failed or expired | −1 per photo |
| Photo deleted | −1 |
| Retention purge | Reset to 0 |

## 9.4 `featuredPhotoCount` — the 12-photo glimpse

Feature (transaction): set `featured: true` where currently `false`; if that matched, `$inc +1` on the wedding where `featuredPhotoCount < 12`, otherwise abort. Unfeaturing and deleting a featured photo decrement.

## 9.5 Invariants

| # | Invariant | Enforced by |
|---|---|---|
| I-1 | Every active wedding has ≥ 1 Admin, and `adminCount` equals the number of Admin memberships | §9.2 |
| I-2 | A user has at most one membership | Unique index `{ userId: 1 }` |
| I-3 | `photoSlotsUsed = count(photos) + count(photo_uploads)` for the wedding, and ≤ 2,000 | §9.3 |
| I-4 | `featuredPhotoCount = count(photos where featured)`, and ≤ 12 | §9.4 |
| I-5 | `guest.rsvp.attendingCount ≤ guest.maxPeople` | §10 |
| I-6 | Every stored reference points at a document in the same wedding | §6.4, §7 |
| I-7 | At most one `PENDING` member invitation per wedding and email | Partial unique index |
| I-8 | No activity log entry is ever modified | §5.15 |

## 9.6 Reconciliation

`npm run db:reconcile -- --wedding <id>` recomputes I-1, I-3 and I-4 from the underlying collections, reports any drift, and repairs it with `--fix`. It is run manually during the pilot when something looks wrong; it is not scheduled in V1.

---

# 10. Guest Concurrency and RSVP Writes

The system design calls for an atomic check where RSVP capacity is involved (SYSTEM §76). This is how.

**Guest submits an RSVP.** Capacity is checked inside the update filter, so a concurrent change to `maxPeople` cannot be bypassed:

```ts
const res = await Guest.updateOne(
  { _id: guest._id, weddingId: guest.weddingId, maxPeople: { $gte: count } },
  {
    $set: {
      'rsvp.status': status,
      'rsvp.attendingCount': status === 'ATTENDING' ? count : 0,
      'rsvp.respondedAt': new Date(),
      'rsvp.respondedVia': 'GUEST_LINK',
    },
    $inc: { version: 1 },
  },
);
if (res.matchedCount === 0) {
  // re-read: guest gone → generic "unavailable"; otherwise maxPeople changed → show the new maximum
}
```

**Member lowers `maxPeople`.** Cannot go below what the guest has already confirmed:

```ts
await Guest.updateOne(
  { _id, weddingId, 'rsvp.attendingCount': { $lte: newMax } },
  { $set: { maxPeople: newMax }, $inc: { version: 1 } },
);
// not matched → CONFLICT: "This guest has confirmed N people. Update their RSVP first."
```

**Member edits the RSVP by hand.** The edit form carries the `version` it loaded, and the update filter includes it. If the guest responded through their link while the form was open, the member gets a conflict instead of silently overwriting the guest's answer.

**Every other guest field** (name, phone, notes, side) is last-write-wins (PRD Rule 8), using targeted `$set` of only the changed fields.

**Never `doc.save()` on a guest.** It writes back every field it loaded, including an `rsvp` that may have changed since.

---

# 11. Tokens and Secrets

| Token | Entropy | Stored as | Lookup | Lifetime |
|---|---|---|---|---|
| Session | 256-bit | HMAC | `sessions.tokenHash` | 30 days, sliding |
| Password reset | 256-bit | HMAC | `password_resets.tokenHash` | 1 hour, single use |
| Member invitation | 256-bit | HMAC | `member_invitations.tokenHash` | 7 days |
| Guest invitation link | 128-bit | Plaintext, `select: false` | `guests.inviteLink.token` | Until regenerated |
| Gallery link / QR | 128-bit | Plaintext, `select: false` | `weddings.gallery.token` | Permanent |
| Photo key id | 128-bit | Inside the R2 key | — | Life of the photo |
| Website slug suffix | 6 chars `[a-z0-9]` (~31 bits) | Plaintext | `weddings.website.slug` | Permanent |
| Guest device id | Client-generated random | HMAC before storage | `photo_uploads`, `rate_limits` | Per browser |

- All random values come from `crypto.randomBytes` and are encoded base64url (128-bit → 22 characters, short enough for a WhatsApp message).
- **HMAC, not plain SHA-256**, for stored token hashes: with a server-side secret, someone holding only a database copy cannot even test guesses offline.
- **Plaintext** guest and gallery tokens are the stable-sharing exception (SYSTEM §22): organisers must be able to copy the same link again.
- **The slug suffix is obscurity, not security.** The website contains only what the family chose to publish. The pages that carry private data — invitation and gallery — use real 128-bit tokens.

---

# 12. Expiry and TTL

| Data | Field | Mechanism | Notes |
|---|---|---|---|
| Sessions | `expiresAt` | TTL index | Also checked on read |
| Password resets | `expiresAt` | TTL index | Also deleted on use |
| Rate-limit counters | `expiresAt` | TTL index | |
| Finished email jobs | `purgeAt` | TTL index | 90 days after finishing |
| Upload reservations | `expiresAt` | **Cleanup job, not TTL** | Must release the slot (§5.13) |
| Member invitations | `expiresAt` | Computed, never deleted | Removed with the wedding |
| R2 `staging/` objects | — | R2 lifecycle rule, 1 day | Backstop if the cleanup job misses them |

TTL deletion is a background task that runs roughly every 60 seconds. It is cleanup, never correctness: every lookup that depends on expiry also filters on it.

---

# 13. Common Queries

Every query below is narrowed by `weddingId` to at most a few thousand documents, so none needs caching in V1.

## 13.1 Dashboard guest summary

```ts
Guest.aggregate([
  { $match: { weddingId, 'invitedEvents.0': { $exists: true } } },   // invited to at least one event
  { $group: {
      _id: null,
      invitations:     { $sum: 1 },
      peopleInvited:   { $sum: '$maxPeople' },
      attending:       { $sum: { $cond: [{ $eq: ['$rsvp.status', 'ATTENDING'] }, 1, 0] } },
      notAttending:    { $sum: { $cond: [{ $eq: ['$rsvp.status', 'NOT_ATTENDING'] }, 1, 0] } },
      pending:         { $sum: { $cond: [{ $eq: ['$rsvp.status', 'PENDING'] }, 1, 0] } },
      peopleAttending: { $sum: '$rsvp.attendingCount' },
      viaLink:         { $sum: { $cond: [{ $eq: ['$rsvp.respondedVia', 'GUEST_LINK'] }, 1, 0] } },
  } },
]);
```

`viaLink / invitations` is the pilot success metric (PRD §15, target ≥ 60%).

Guests invited to **no** events are excluded from every number above. Otherwise, after an event is deleted, a household that was invited only to that event would still count toward "people attending" (§14.1). They are counted separately so the dashboard can flag them:

```ts
Guest.countDocuments({ weddingId, invitedEvents: { $size: 0 } });   // "3 guests are not invited to any event"
```

The guest list offers the same set as a filter, "Not invited to any event".

## 13.2 Per-event headcount (the caterer number)

```ts
Guest.aggregate([
  { $match: { weddingId, 'rsvp.status': 'ATTENDING' } },
  { $unwind: '$invitedEvents' },
  { $group: {
      _id: '$invitedEvents.eventId',
      households: { $sum: 1 },
      people:     { $sum: '$rsvp.attendingCount' },
  } },
]);
```

Under ADR-13, a household attending with 3 people counts as 3 at **every** event it is invited to. The UI should label this "confirmed guests invited to this event" rather than implying per-event confirmation.

## 13.3 Expenses by category and total

```ts
Expense.aggregate([
  { $match: { weddingId } },
  { $group: { _id: '$category', totalPaise: { $sum: '$amountPaise' } } },
]);
```

The overall total is the sum of the groups, computed in code.

## 13.4 Vendor agreed vs recorded

```ts
Expense.aggregate([
  { $match: { weddingId, vendorId: { $exists: true } } },
  { $group: { _id: '$vendorId', recordedPaise: { $sum: '$amountPaise' } } },
]);
```

Merged in code with each vendor's `agreedCostPaise` to show **Agreed ₹1,80,000 · Recorded ₹1,00,000**.

## 13.5 Gallery page (cursor pagination)

```ts
Photo.find({
  weddingId,
  ...(cursor && {
    $or: [
      { createdAt: { $lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, _id: { $lt: cursor.id } },
    ],
  }),
})
  .sort({ createdAt: -1, _id: -1 })
  .limit(40)
  .select('thumbKey width height eventId uploaderName createdAt')
  .lean();
```

The `_id` tiebreak matters: many photos uploaded within the same millisecond at a reception would otherwise be skipped or repeated between pages.

## 13.6 Upcoming events and tasks

```ts
Event.find({ weddingId, date: { $gte: todayIn(tz) } }).sort({ date: 1, startTime: 1 }).limit(3);

Task.find({ weddingId, status: { $ne: 'DONE' }, dueDate: { $exists: true } })
  .sort({ dueDate: 1 })
  .limit(5);          // overdue tasks sort first, which is what the family needs to see
```

---

# 14. Deletion

## 14.1 Delete an event

**Before deleting**, the confirmation dialog shows two things (PRD §14):

```ts
// everyone invited to this event
const invitedCount = await Guest.countDocuments({ weddingId, 'invitedEvents.eventId': id });

// guests for whom this is the ONLY invited event: they will be left invited to nothing
const onlyThisEvent = { weddingId, invitedEvents: { $size: 1 }, 'invitedEvents.eventId': id };
const onlyThisEventCount = await Guest.countDocuments(onlyThisEvent);
const onlyThisEventNames = await Guest.find(onlyThisEvent, { name: 1 }).limit(20).lean(); // "…and N more" beyond 20
```

> **Delete "Cocktail"?** 38 guests are invited to it. 3 of them — Mehra Family, Kapoor Family, Sunil Uncle — are invited only to Cocktail and will not be invited to any event.

**In one transaction:**

```ts
const leftWithNoEvents = await Guest.countDocuments(onlyThisEvent, { session }); // recounted: the list may have changed since the dialog opened
Event.deleteOne({ _id: id, weddingId });
const { modifiedCount: affectedGuests } = await Guest.updateMany(
  { weddingId, 'invitedEvents.eventId': id },
  { $pull: { invitedEvents: { eventId: id } }, $inc: { version: 1 } },
);
Task.updateMany({ weddingId, eventId: id }, { $unset: { eventId: '' } });
Expense.updateMany({ weddingId, eventId: id }, { $unset: { eventId: '' } });
Vendor.updateMany({ weddingId, eventIds: id }, { $pull: { eventIds: id } });
Photo.updateMany({ weddingId, eventId: id }, { $unset: { eventId: '' } });
PhotoUpload.updateMany({ weddingId, eventId: id }, { $unset: { eventId: '' } });
ActivityLog.create({ action: 'event.deleted', meta: { affectedGuests, leftWithNoEvents }, ... });
```

**After commit:** delete the event's cover image from R2, if it had one. As with photos (§14.5), a failed delete leaves an orphaned object that wedding deletion removes later; it never blocks the event deletion.

**Guests left invited to no events**

- They remain guests. Nothing about them is deleted.
- **Their RSVP is not changed.** A guest's answer is theirs; the application does not rewrite it on the family's behalf.
- They drop out of every dashboard number and headcount (§13.1, §13.2) and are listed under "Not invited to any event", where the family can invite them to another event or delete them.
- **Their invitation link still opens**, but shows a message instead of events and hides the RSVP form: *"There are no events on your invitation right now. The family will be in touch."* The link keeps working so that if the family invites them to another event, the same link shows it.
- If they are later invited to another event, their earlier answer applies to it, because under ADR-13 an answer covers every invited event, including ones added after the guest replied. The guest edit screen shows the current answer next to the event picker so the member can reset it to Pending.

## 14.2 Delete a guest (transaction)

Delete the guest; set that guest's `PENDING` email jobs to `CANCELLED`; write `guest.deleted`.

## 14.3 Delete a vendor (transaction)

Delete the vendor; `$unset` `vendorId` on its expenses. The expenses remain.

## 14.4 Remove a member (transaction)

If the member is an Admin, apply §9.2. Delete the membership; `$unset` `assigneeUserId` on their tasks; write `member.removed`.

Their sessions are **not** deleted. Access ends on their next request because membership resolution finds nothing. They keep their account and can create or join another wedding.

## 14.5 Delete a photo

In a transaction: delete the photo row, decrement `photoSlotsUsed` (and `featuredPhotoCount` if featured), write `photo.deleted`.

After commit: delete the two R2 objects. If that fails, the objects are orphaned under `weddings/{weddingId}/` — they cost storage but not a slot, and are removed by wedding deletion or retention.

## 14.6 Upload cleanup job (daily)

For each `photo_uploads` document with `expiresAt < now`: delete its staging objects, then in one transaction delete the document and decrement `photoSlotsUsed` by 1 (never below 0).

## 14.7 Photo retention job (daily)

For each wedding with `status: 'ACTIVE'`, `weddingDate < (today − 12 months)` and no `photosPurgedAt`:

1. Delete R2 objects under `weddings/{weddingId}/photos/`
2. `Photo.deleteMany({ weddingId })`, `PhotoUpload.deleteMany({ weddingId })`
3. Set `counters.photoSlotsUsed = 0`, `counters.featuredPhotoCount = 0`, `gallery.guestUploadEnabled = false`, `photosPurgedAt = now`

The cutoff is a `"YYYY-MM-DD"` string, so the comparison is a plain string comparison.

## 14.8 Delete a wedding

Implements SYSTEM §98. Every step is idempotent. The request runs the whole sequence; if it fails partway, the daily cleanup job finds the wedding still `DELETING` and resumes from the top.

```text
1. weddings.updateOne({ _id, status: 'ACTIVE' }, { $set: { status: 'DELETING', deletionRequestedAt, deletionRequestedBy } })
      ← all access blocked from here

2. R2: list and delete prefix weddings/{weddingId}/   (1,000 keys per batch)
   R2: list and delete prefix staging/{weddingId}/

3. deleteMany({ weddingId }) on, in order:
      photo_uploads, photos, email_jobs, activity_logs, guests, tasks,
      expenses, vendors, events, member_invitations, wedding_memberships

4. weddings.deleteOne({ _id, status: 'DELETING' })
      ← last, because the DELETING wedding is the marker that lets step 1–3 resume
```

This is **not** a transaction: it may touch thousands of documents and R2 objects, and R2 cannot be rolled back. Idempotent, resumable steps are the right tool.

`users` and `sessions` are untouched. Former members keep their accounts, now without a wedding.

---

# 15. Limits and Guardrails

| Limit | Value | Enforcement | Exactness |
|---|---|---|---|
| Photos per wedding | 2,000 | `photoSlotsUsed` conditional `$inc` | **Exact** under concurrency |
| Featured photos per wedding | 12 | `featuredPhotoCount` | **Exact** |
| Admins per wedding | ≥ 1 | `adminCount` | **Exact** |
| Photos per upload request | 30 | Request validation | Exact |
| Photos per device per day | 150 | `rate_limits` | Approximate (device id can be cleared) |
| Guests per wedding | 1,000 | Count check on create and import | Soft |
| Events per wedding | 30 | Count check on create | Soft |
| Members per wedding | 25 | Count check on invite | Soft |
| CSV rows per import | 1,000 | Request validation | Exact |
| `maxPeople` per guest | 1–20 | Schema | Exact |

**Soft** limits use check-then-insert and can overshoot slightly under concurrency. That is acceptable: nothing breaks at 1,003 guests. Only limits where overshooting causes harm — storage cost, an unmanageable wedding, a website with 14 "featured" photos — get the exact, counter-based treatment.

All values are configuration, not constants scattered through code.

---

# 16. Sizing

Estimate for a large wedding:

| Data | Documents | Approx. size |
|---|---|---|
| Guests | 1,000 | ~0.8 MB |
| Photos (metadata) | 2,000 | ~0.8 MB |
| Activity logs | ~5,000 | ~2 MB |
| Everything else | — | < 0.5 MB |
| Indexes | — | ~1–2 MB |
| **MongoDB total** | | **~5 MB** |
| **R2 total** (display + thumb) | 2,000 photos | **~1.7 GB** |

The Atlas free tier's storage limit (512 MB at the time of writing — check current limits) therefore holds on the order of 100 large weddings. Storage is not what forces a paid tier during the pilot; backups are (§18).

---

# 17. Migrations and Index Management

## 17.1 Migration scripts

- Numbered files in `migrations/`, e.g. `0004_guest_phone_e164.ts`, each exporting `up(db)`.
- A runner applies unapplied files in order and records each in `schema_migrations`.
- Every migration is **idempotent**: running it twice is harmless.
- **Forward-only.** There are no down migrations; recovery is a restore from backup (§18), which is why a backup is taken before running any migration against production.
- Run explicitly per environment (`npm run db:migrate`) before deploying code that depends on it. Never at application startup.

**No migration is needed for:** adding an optional field, or adding an enum value that existing readers tolerate.

## 17.2 Indexes

Indexes are declared in the Mongoose schemas, where they document intent, but in production:

- `autoIndex: false`. With it on, every serverless cold start issues index-creation calls for every model.
- Indexes are created by a migration.
- `Model.syncIndexes()` is **never** run automatically. It drops indexes that are not in the schema, which is how an index added by hand during an incident silently disappears on the next deploy.

## 17.3 Renaming note

The existing development data and R2 bucket use the previous product name. Rename the bucket to `shaadioo-dev` and start the development database fresh rather than migrating it; there is no real data to preserve yet.

## 17.4 V1.1 per-event RSVP migration

This is the cost ADR-13 accepted, made concrete. Because `invitedEvents` already holds objects (ADR-17), the migration is a single pipeline update that copies each guest's V1 answer into each of their invited events:

```js
db.guests.updateMany({}, [
  { $set: {
      invitedEvents: {
        $map: {
          input: '$invitedEvents',
          as: 'ie',
          in: { $mergeObjects: ['$$ie', {
            rsvpStatus: '$rsvp.status',
            attendingCount: '$rsvp.attendingCount',
          }] },
        },
      },
  } },
]);
```

After it runs, `guests.rsvp` can remain as a derived summary or be removed. §13.2 changes to read per-item values instead of the guest-level answer.

---

# 18. Backups

SYSTEM §99 requires backups before the first pilot wedding. At the data level:

- **Must be backed up:** every collection except `rate_limits` and `sessions` (losing sessions only logs people out).
- **Two workable options:**
  1. A paid Atlas tier with automated backups enabled.
  2. A scheduled `mongodump --gzip --archive` of production, run from a scheduled CI job (for example a GitHub Actions workflow on a daily cron), written to a separate R2 bucket such as `shaadioo-backups` whose credentials the application does not have.
- **A backup is taken immediately before every production migration** (§17.1).
- **A restore is tested** into a scratch database before the pilot. A backup that has never been restored is not a backup.

---

# 19. Decisions

Same format as the ADRs in SYSTEM §92.

## DB-01: Calendar dates as `"YYYY-MM-DD"` strings
**Decision:** Wedding date, event date, due dates, expense dates and RSVP deadline are strings.
**Reason:** A calendar day has no timezone; storing it as an instant shifts it by a day in UTC contexts (§1.4).
**Consequence:** "Today" must always be computed in the wedding's timezone with `todayIn(tz)`.

## DB-02: Event times as wall-clock strings
**Decision:** `startTime` / `endTime` are `"HH:mm"` in the wedding's timezone.
**Reason:** Every reader must see venue time, including guests abroad (§1.5).
**Consequence:** No instant-based queries across weddings (such as "every event starting in the next hour"). None are needed in V1.

## DB-03: Money as integer paise
**Decision:** All amounts are whole paise in a number field.
**Reason:** Exact sums without `Decimal128` friction.
**Consequence:** Every write validates `Number.isInteger`; formatting happens only in the UI.

## DB-04: Invited events embedded on the guest (ADR-17)
**Decision:** `guests.invitedEvents: [{ eventId }]`, no `guest_invitations` collection.
**Reason:** With RSVP on the guest (ADR-13), a separate collection would hold only guest–event pairs, costing extra writes and a transaction on every guest edit for no benefit.
**Consequence:** Bounded at 30 events; per-event RSVP in V1.1 is the single-statement migration in §17.4.

## DB-05: Pending uploads in their own collection
**Decision:** `photo_uploads` holds in-flight reservations; `photos` holds only published photos.
**Reason:** No status filter on gallery queries; reservations can be released precisely.
**Consequence:** Publishing is a two-collection transaction.

## DB-06: Stored counters only for concurrency-enforced limits
**Decision:** Exactly three stored counters (`adminCount`, `photoSlotsUsed`, `featuredPhotoCount`); every display number is computed.
**Reason:** Display counters drift and need repair code; limit counters are the only correct way to prevent write skew and overshoot (§9.2).
**Consequence:** A reconciliation script exists for the three that are stored (§9.6).

## DB-07: Absent rather than null
**Decision:** Unset optional fields are absent; clearing uses `$unset`.
**Reason:** One representation of "not set" instead of two.
**Consequence:** API handlers translate `null` from the client into `$unset`.

## DB-08: Tenant guard in middleware, unscoped access in one module
**Decision:** Tenant models throw on queries without `weddingId`; the nine legitimate unscoped lookups use the native collection in `unscoped.ts` only.
**Reason:** Isolation that depends on remembering a filter eventually fails (SYSTEM §16).
**Consequence:** `findById` cannot be used on tenant models; this is intentional.

## DB-09: Random photo key ids
**Decision:** R2 keys use a fresh 128-bit id, never the ObjectId.
**Reason:** Photo URLs must be unguessable (SYSTEM §42); ObjectIds are predictable from their neighbours.
**Consequence:** The photo row stores both keys explicitly.

## DB-10: Hard delete everywhere
**Decision:** No soft-delete flags on any collection; history lives in `activity_logs`.
**Reason:** No forgettable "active" filter on every query, and "deleted" really removes guest personal data (SYSTEM §87).
**Consequence:** Every reference has an explicit cascade rule (§7); accidental deletion is guarded in the UI, not by keeping data.

---

# 20. Not in V1

- **User account deletion.** Added to the PRD on 2026-10-03 (§9.25 Account, M4). The cascade (sessions, reset tokens, membership, sole-member wedding, "Former member" display) is not designed here yet; design it before M4 starts.
- **Multiple weddings per user.** An index change (§5.5) plus a "current wedding" in the session.
- **Full-text search.** Guest search is a case-insensitive prefix match over ≤ 1,000 scoped documents; Atlas Search is not needed.
- **Per-event RSVP.** V1.1, via §17.4.
- **Scheduled reconciliation.** Manual in V1 (§9.6).
