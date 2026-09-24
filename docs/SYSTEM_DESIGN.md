# Shaadioo
## System Design Architecture Document

**Version:** V1 (Document revision 3)
**Status:** Baseline — aligned with PRD revision 3 and DATABASE_DESIGN revision 1
**Architecture Style:** Modular Monolith
**Application Type:** Full-stack Web Application (Next.js)

---

# 0. Change Log

## Revision 3 (aligned with DATABASE_DESIGN.md)

1. **No `guest_invitations` collection (§31, §56, §74, ADR-03, ADR-17).** With RSVP on the guest (ADR-13), a separate collection would hold only guest–event pairs. Invited events are now embedded on the guest as `invitedEvents: [{ eventId }]`.
2. **Three stored counters, not one (§97).** `photoCount` is renamed `photoSlotsUsed` and joined by `adminCount` and `featuredPhotoCount`, all in `weddings.counters`. The rule is unchanged: a number is stored only when it enforces a limit under concurrency.
3. **Events are hard deleted (§23).** "Active" events wording removed; there is no archived state.
4. **Slug suffix is 6 characters (§7.2, §26, §27).** Example updated to `akshay-princi-k7x2m9`.
5. **Wedding deletion list corrected (§98).** Adds `photo_uploads`; removes `sessions`, which belong to users rather than weddings.

## Revision 2

Changes from the original revision of this document:

1. **Renamed** from "Make My Marriage" to **Shaadioo** throughout, including example URLs and the R2 bucket naming convention.
2. **Photo pipeline (§37, §42, §97):** the browser now produces a display image (max 2560 px) and a thumbnail before upload. Originals are not stored. HEIC is converted in the browser before the server signature check. Galleries load thumbnails, not originals. This replaces "originals with lazy loading, thumbnails deferred".
3. **Photo quota (§97):** 2,000 photos per wedding, enforced by an atomic reservation before upload URLs are issued; 30 per upload; 150 per device per day.
4. **Wedding website (§26, §27):** publish toggle, `noindex`, and a random suffix on the slug. The site is unlisted rather than public.
5. **Gallery glimpse (§26):** the website shows up to 12 member-featured photos. Nothing is published automatically, and the site never links to the full gallery.
6. **Activity log (§96):** added to V1 as an append-only, admin-visible record. Previously excluded.
7. **Wedding deletion and photo retention (§98):** hard delete of all wedding data including guest personal data; 12-month photo retention; §87 now states a decision instead of deferring it.
8. **Backups (§99):** added. Atlas free-tier clusters have no automated backups, which is unacceptable for a pilot holding a real family's guest list.
9. **Email reality check (§47, §51, §54):** documents the Vercel Hobby once-per-day cron limit and Resend's free-tier 100/day quota, adds a transactional reserve, and records the external-scheduler upgrade path as a V2 item.
10. **Vendors (§36):** the copy-details-on-add decision is kept and made explicit, with the Google Maps Platform terms risk recorded rather than left implicit.
11. **RSVP (§31):** guest-level RSVP storage is kept and made explicit as ADR-13, with the V1.1 migration consequence stated.
12. **Indexes (§74):** every wedding-scoped compound index must begin with `weddingId`.
13. **Observability (§63):** unchanged decision (no Sentry, no external platform in V1), now recorded as ADR-16 after explicit review.
14. **Implementation logs moved** out of this document into `IMPLEMENTATION_NOTES.md`. This document describes the intended design; that one records what has been built and when.

---

# 1. Purpose

This document defines the high-level system architecture for **Shaadioo**, a collaborative Indian wedding-management platform.

It establishes:

- Overall architecture
- Major system components
- Application boundaries
- Backend structure
- Authentication and authorization model
- Data ownership and multi-tenancy
- Guest-access architecture
- File-storage architecture
- Email architecture
- Vendor-discovery integration
- Wedding website architecture
- Deployment topology
- Security considerations
- Scaling strategy
- Reliability and failure-handling principles

This document remains at the **system-design level**.

Detailed MongoDB schemas, collection structures, API request/response contracts, UI component architecture and exact folder structure are defined separately.

Where this document and `PRD.md` disagree, the PRD defines *what* the product does and this document defines *how*. Any conflict is a defect in one of the two and must be resolved, not worked around.

---

# 2. Architecture Goals

The architecture should prioritize:

1. **Simplicity**
2. **Maintainability**
3. **Fast development**
4. **Clear domain boundaries**
5. **Production readiness**
6. **Low infrastructure overhead**
7. **Reasonable scalability**
8. **Security between weddings**
9. **Excellent mobile guest experience**
10. **Ability to evolve without premature distributed-system complexity**

The architecture should comfortably support approximately:

- Up to 1,000 guest invitations per wedding
- Up to 2,000 photos per wedding (the V1 product cap — see §97)
- Thousands of weddings over time

without requiring major architectural changes.

---

# 3. Architecture Principles

## 3.1 Start as a Modular Monolith

The entire product operates as one deployable application. Microservices are not introduced unless a future scaling or organizational requirement justifies them.

## 3.2 Wedding is the Tenant Boundary

The primary unit of isolation is the **Wedding**.

Almost every private domain object belongs to one wedding: events, tasks, guests, vendors, expenses, photos, invitations, wedding members, activity log entries.

This rule must be enforced consistently throughout the backend.

## 3.3 Explicit APIs

Even though frontend and backend exist inside the same Next.js application, backend functionality is exposed through clearly designed REST APIs.

This creates clean boundaries between UI, authentication, validation, business logic and data persistence.

## 3.4 Guests Require No Accounts

Guests are never forced through an authentication flow. Guest-facing functionality relies on secure, high-entropy access tokens.

## 3.5 Managed Infrastructure Where Possible

Managed services are used for application hosting, database, object storage, email and vendor discovery.

## 3.6 The Guest Device Is the Constraint

Guest-facing pages are designed for a budget Android phone on 4G at a wedding venue, not for a laptop on office Wi-Fi. This principle decides the photo pipeline (§37, §42), page weight and pagination.

---

# 4. Technology Stack

| Layer | Technology |
|---|---|
| Language | TypeScript |
| Frontend | Next.js |
| Backend Runtime | Node.js through Next.js |
| Backend API | Next.js Route Handlers |
| API Style | REST |
| Architecture | Modular Monolith |
| Database | MongoDB Atlas |
| ODM | Mongoose |
| Validation | Zod |
| Authentication | Custom authentication |
| Sessions | Server-side sessions + secure cookies |
| File Storage | Cloudflare R2 |
| Image derivatives | Browser-side (canvas + HEIC decode) |
| Email | Resend |
| Background Email | MongoDB jobs + small batches |
| Scheduling | Vercel Cron (V1) → external HTTP scheduler (V2) |
| Vendor Discovery | Google Places API |
| Livestream | YouTube Embed |
| Hosting | Vercel |
| Logging | Application / Vercel logs |
| Realtime | Not used in V1 |
| External observability | Not used in V1 (ADR-16) |
| Product Analytics | Not used in V1 |

---

# 5. High-Level System Architecture

```text
                         ┌──────────────────────┐
                         │       Browser        │
                         │  Members + Guests    │
                         └──────────┬───────────┘
                                    │ HTTPS
                                    ▼
                      ┌────────────────────────────┐
                      │       Next.js App          │
                      │          Vercel            │
                      │  ┌──────────────────────┐  │
                      │  │      React UI        │  │
                      │  ├──────────────────────┤  │
                      │  │ REST Route Handlers  │  │
                      │  ├──────────────────────┤  │
                      │  │ Business Services    │  │
                      │  ├──────────────────────┤  │
                      │  │ Persistence Layer    │  │
                      │  └──────────────────────┘  │
                      └────────────┬───────────────┘
                                   │
                ┌──────────────────┼─────────────────────┐
                ▼                  ▼                     ▼
       ┌────────────────┐ ┌────────────────┐   ┌────────────────┐
       │ MongoDB Atlas  │ │ Cloudflare R2  │   │     Resend     │
       │ App Data       │ │ Photos/Media   │   │ Email Delivery │
       └────────────────┘ └────────────────┘   └────────────────┘
                                   │
                                   ▼
                         ┌──────────────────┐
                         │ Google Places API│
                         │ Vendor Discovery │
                         └──────────────────┘
```

Note that photo bytes never pass through the Next.js application. The browser uploads directly to R2 and reads directly from R2 (§38, §42).

---

# 6. Modular Monolith Architecture

Business functionality is divided into domain modules inside one deployable:

```text
Application

├── Auth
├── Wedding
├── Wedding Members
├── Events
├── Tasks
├── Guests
├── Invitations
├── Expenses
├── Vendors
├── Wedding Website
├── Gallery
├── Livestream
├── Email
└── Activity Log
```

Each module owns its business logic:

```text
Guests
   API Layer
      ↓
   Guest Validation
      ↓
   Guest Service
      ↓
   Guest Persistence (wedding-scoped)
      ↓
   MongoDB
```

API route handlers remain thin. They:

1. Parse the request
2. Authenticate the user where required
3. Validate the request
4. Call a business service
5. Return an HTTP response

Business logic does not live inside route files.

---

# 7. Application Surfaces

## 7.1 Private Wedding Dashboard

```text
/app/*
```

Requires an authenticated Wedding Member session. Contains the dashboard, events, tasks, guests, invitations, RSVP management, expenses, vendors, website configuration, photo management, livestream, settings, wedding members and the activity log.

## 7.2 Unlisted Wedding Website

```text
/w/akshay-princi-k7x2m9
```

No authentication. Reachable only when published, excluded from search indexes, and addressed by a slug with a random suffix (§27).

Contains intentionally published wedding information: couple details, wedding date, all events, a featured-photo glimpse and the livestream.

## 7.3 Token-Protected Guest Experience

```text
/invite/:token
/gallery/:token
```

No account or login. Access is controlled by possession of an unpredictable secret token.

- **Invitation:** guest-specific invitation, invited events, RSVP
- **Gallery:** view and upload wedding photos

---

# 8. Authentication Architecture

Shaadioo implements custom email/password authentication. No external authentication framework is used in V1.

## 8.1 Signup Flow

```text
User
 ▼
POST /api/auth/signup
 ▼
Validate Input
 ▼
Check Existing Email
 ▼
Hash Password
 ▼
Create User
 ▼
Create Session
 ▼
Set Secure Cookie
 ▼
Create Wedding  /  Join Wedding via invitation token
```

No email verification is required in V1 (ADR-05).

**Invitation-aware signup:** when signup carries a valid member invitation token, the user joins that wedding and is never routed to wedding creation. This prevents the one-wedding-per-user rule from locking an invited member out (PRD Rule 9).

---

# 9. Password Security

Passwords are never stored directly. Only a hash produced by an industry-standard password-hashing library is stored.

```text
Plain Password → Password Hashing Algorithm → Password Hash → MongoDB
```

Authentication code never implements cryptographic primitives manually.

---

# 10. Session Architecture

Server-side sessions are the authentication model.

```text
Login
  ↓ Create Session
  ↓ Store session in MongoDB
  ↓ Return random session token
  ↓ Store token in secure cookie
```

Session metadata includes `sessionId`, `userId`, `createdAt`, `expiresAt`.

Cookies use HttpOnly, Secure and SameSite. The cookie carries a session identifier, never trusted authorization information.

Server-side sessions are what make PRD §14 possible: when a member is removed or demoted, their sessions are invalidated and access ends immediately. A stateless JWT could not do this without an equivalent per-request membership lookup.

---

# 11. Logout

```text
POST /api/auth/logout → Invalidate Session → Delete Session Cookie
```

Sessions also expire automatically after a defined period.

---

# 12. Password Reset

```text
Forgot Password
   ↓ Enter Email
   ↓ Generate Secure Reset Token
   ↓ Store Token Hash + Expiry
   ↓ Send Reset Email through Resend
   ↓ User Opens Link
   ↓ Set New Password
   ↓ Invalidate Reset Token
```

Reset tokens are stored hashed. Existing active sessions may be invalidated on password reset.

Password reset email is transactional and must never be blocked by a bulk invitation run — see the transactional reserve in §51.

---

# 13. Wedding Membership Model

```text
User
 ▼
WeddingMembership
 ├── weddingId
 ├── role (ADMIN | MANAGER)
 └── relationship label (display only)
```

The relationship label ("Bride's Father") is presentation. Only `role` grants permission.

---

# 14. Authorization

### Admin

All wedding-management operations, plus:

- Invite Wedding Members
- Remove Wedding Members
- Change Wedding Member roles
- View the activity log
- Delete the wedding

### Manager

All normal wedding-management operations. Cannot perform any Admin-only operation above.

---

# 15. Authorization Flow

Every private API request conceptually performs:

```text
Request
   ↓ Authenticate Session
   ↓ Resolve Current User
   ↓ Resolve Wedding Membership
   ↓ Resolve weddingId  (from membership, never from the client)
   ↓ Check Required Permission
   ↓ Perform Operation
```

Example: `PATCH /api/tasks/:taskId`

The backend must not load:

```text
Task where _id = taskId
```

It must load:

```text
Task where _id = taskId AND weddingId = currentWeddingId
```

This prevents cross-wedding access. The same pattern applies to every wedding-owned resource.

---

# 16. Multi-Tenancy

Each Wedding is a tenant. Even though users belong to one wedding in V1, the application is multi-tenant and isolation is enforced in backend queries. Front-end filtering is never sufficient.

```text
Wedding A                 Wedding B
 ├── Events                ├── Events
 ├── Tasks                 ├── Tasks
 ├── Guests                ├── Guests
 └── Expenses              └── Expenses
```

Members of Wedding A must never reach Wedding B data. This is verified by the tests in §91, which are mandatory rather than aspirational.

---

# 17. Wedding Creation Flow

```text
New User
   ↓ Authenticated
   ↓ No Wedding Membership Found
   ↓ Create Wedding
   ↓ Create Wedding Membership (role = ADMIN)
   ↓ Redirect to Dashboard
```

Creating a wedding and its initial membership happens in a transaction (§86).

**Empty-wedding deletion:** a wedding with no events, guests, tasks, expenses, vendors or photos can be deleted by its Admin in one step, so a user who created a wedding by mistake can accept a member invitation instead (PRD §9.2).

---

# 18. Wedding Member Invitation Architecture

An Admin invites a person by email:

```text
rahul@example.com
Role: MANAGER
```

The system creates a member invitation containing:

```text
weddingId
email
role
tokenHash
status
expiresAt
```

Member invitation tokens are stored **hashed**. Unlike guest invitation links (§22), they are single-use and short-lived, so there is no need to re-display them.

---

# 19. Wedding Member Invitation Flow

```text
Admin → Invite Email → Create Invitation → Send via Resend → Recipient Opens Invite
```

If the recipient has no account:

```text
Invitation → Signup → Create User → Accept Invitation → Create Membership
```

If the recipient already has an account:

```text
Invitation → Login → Accept Invitation → Create Membership
```

If the user already belongs to another wedding, the invitation is rejected with a clear message, because V1 supports one wedding per user. If their existing wedding is empty, the UI offers to delete it and retry (§17).

Invitations expire after 7 days and can be resent.

---

# 20. Wedding Member Safety Rules

The backend prevents:

- Manager inviting, removing or modifying members
- A wedding ending with zero Admins
- Removing or demoting the final Admin
- Unauthorized membership modification
- Joining multiple weddings

---

# 21. Guest Architecture

A guest has no user account, no password, no session and no application role. A guest is wedding data.

```text
Wedding → Guest → Invitation Token
```

---

# 22. Guest Invitation Tokens

Guest URLs never expose predictable identifiers.

```text
Avoid:  /invite/12345
Use:    /invite/Fkm28KmSx92L...
```

Tokens carry enough entropy that guessing another guest's link is infeasible.

**Stable-sharing exception.** V1 stores a high-entropy random invitation token in the Guest document in plaintext (see `API_DESIGN.md` §29), so organisers can re-retrieve the same sharing URL for WhatsApp. This supersedes any hash-only suggestion for guest invitations.

The token must be:

- Excluded from ordinary queries and from every response except the single-guest detail (`GET /api/guests/:id`) and the create and regenerate responses
- Never written to logs (§62)
- Regenerable by a member, which immediately invalidates the previous link

Session tokens, member invitation tokens and password reset tokens remain hashed.

**Accepted risk:** a database compromise exposes guest invitation links. This is judged acceptable because the same compromise would already expose guest names and phone numbers, which is the more serious loss.

---

# 23. Guest RSVP Flow

```text
Guest Opens /invite/:token
      ↓ Validate Token
      ↓ Resolve Guest
      ↓ Load Invited Events (same wedding)
      ↓ Display Invitation
      ↓ Guest Submits RSVP
      ↓ Validate Maximum Guest Count
      ↓ Validate RSVP Deadline
      ↓ Update RSVP (atomic, version-checked)
```

A guest may return to the same link later and modify their RSVP until the deadline.

Rules enforced server-side:

- Attending count never exceeds the guest's `maxPeople`
- After the RSVP deadline the page is read-only for the guest; members can still edit
- Repeat submissions are idempotent; the latest response wins
- Atomic version/capacity checks prevent lost updates between organiser edits and guest submissions

Public invitation responses use minimal projections: the page exposes only that guest's own invitation data, never the wider guest list. Token-bearing request paths are excluded from application logging, and `no-store` / `no-referrer` / `noindex` protections apply.

RSVP writes reuse the MongoDB rate-limit mechanism (300/minute globally; 20 per invitation per 15 minutes) with HMAC counter keys. Token and owner resolution and capacity validation run before quota is consumed, and per-invitation admission precedes shared admission, so invalid links cannot exhaust shared capacity.

---

# 24. Gallery Guest Access

Gallery access uses a **wedding-level** token rather than guest-specific tokens:

```text
/gallery/7hP3kD9a...
```

This URL is shared through the QR code, WhatsApp or printed material and allows viewing and uploading photos with no account.

Gallery viewing and gallery uploading are independently switchable by members (PRD §9.20). Both are checked server-side on every gallery request and every upload authorization.

---

# 25. QR Code Architecture

The QR code encodes the stable gallery URL:

```text
https://shaadioo.com/gallery/7hP3kD9a...
```

The QR image is generated on demand and is not persisted. The URL is stable so previously printed codes keep working. Misuse is handled by turning viewing or uploads off, never by rotating the URL.

---

# 26. Wedding Website Architecture

Each wedding has an **unlisted** website:

```text
/w/akshay-princi-k7x2m9
```

The page resolves the slug to a Wedding and renders published information.

## Visibility rules

- **Publish toggle:** unpublished weddings return the generic not-found page. Unpublishing takes effect immediately.
- **`noindex`:** website and gallery routes send `noindex` and are excluded from sitemaps and `robots.txt` discovery.
- **Random suffix:** the slug is not derivable from the couple's names (§27).

## Content

| Section | Source |
|---|---|
| Hero | Couple names, date, cover image |
| Welcome | Message, description |
| Events | **All** events with venue, time, dress code, map link |
| Gallery glimpse | Up to **12 photos explicitly marked Featured** by a member |
| Livestream | Embedded YouTube player, or a "Watch on YouTube" fallback (§85) |

Two rules the renderer must enforce:

1. **Nothing reaches the website automatically.** Guest uploads are never published to the website; only member-featured photos appear.
2. **The website never links to the full gallery.** The gallery is reachable only by its own token URL or the QR code.

Because the website lists all events, event-level invitations control RSVP and headcounts, not event privacy. This is an accepted product decision (PRD §9.8).

---

# 27. Wedding Slug Generation

```text
normalize(brideName)-normalize(groomName)-<random suffix>
```

Example:

```text
akshay-princi-k7x2m9
```

Generation steps:

1. Normalize names (lowercase, transliterate, strip unsupported characters)
2. Append a 6-character random suffix (`[a-z0-9]`, not derived from the wedding date)
3. Check uniqueness and regenerate the suffix on collision

The slug is stable after creation. Changing bride name, groom name or wedding date does not change an already published URL, so shared links never break.

The date is deliberately **not** part of the slug: a name-plus-date slug is guessable from a wedding invitation card, which would defeat the unlisted website.

---

# 28. Wedding Themes

```text
Wedding Data → Theme Selection → Theme Renderer → Wedding Website
```

Themes: `CLASSIC`, `MINIMAL`, `MODERN`. Themes modify presentation only and never duplicate wedding content. The invitation page (§7.3) uses the same selected theme.

Milestone 1 ships one theme; the renderer must be structured so adding the other two is data-free presentation work.

---

# 29. Event Architecture

Events belong to a Wedding. Other modules optionally reference events:

```text
Task ───────→ Event
Guest.invitedEvents[] → Event
Vendor ─────→ Event
Expense ────→ Event
Photo ──────→ Event
```

All such references are validated to belong to the same wedding.

Deleting an event warns the organiser with the number of guests invited to it, and names any guests for whom it is their only event. The event is removed from every guest's invited events; guests left with no events keep their RSVP but are excluded from dashboard counts. The full cascade is in `DATABASE_DESIGN.md` §14.1.

---

# 30. Task Architecture

Tasks belong to the wedding and may reference an assigned Wedding Member and an Event. The backend validates that both belong to the same wedding.

When a member is removed, their assigned tasks become unassigned rather than being deleted.

---

# 31. Guest and RSVP Architecture

Guests belong directly to the Wedding. A guest may be invited to several events.

```text
Guest
 ├── weddingId
 ├── name
 ├── side (BRIDE | GROOM | BOTH, optional)
 ├── phone / email (optional)
 ├── maxPeople
 ├── inviteLink.token
 ├── invitedEvents: [{ eventId }]     ← embedded, ≤ 30 (ADR-17)
 └── rsvp
      ├── status                      ← the single V1 answer
      └── attendingCount              ← the single V1 answer
```

Individual family members are not modelled. One guest record is one invitation.

## ADR-13 consequence: RSVP is stored on the guest

The V1 guest answers once, and that answer is stored on the guest record. Per-event headcounts are **derived**: for a given event, sum `attendingCount` across the guests invited to that event.

This is a deliberate simplification. The consequence is recorded, not hidden:

- Per-event RSVP answers in V1.1 will require a **data migration** that copies each guest's answer into each of its `invitedEvents` items.
- Because `invitedEvents` already holds objects rather than bare ids, that migration is a single pipeline update (`DATABASE_DESIGN.md` §17.4), which keeps the cost bounded.

---

# 32. Expense Architecture

```text
Expense
 ├── weddingId
 ├── title, amount, date, category
 ├── paidBy?      (free text: "Papa", "Groom's family")
 ├── eventId?
 ├── vendorId?
 └── notes
```

`paidBy` is free text rather than a member reference, because the person who paid is frequently not a Shaadioo user.

No budgets, no variance, no payment schedules.

---

# 33. Vendor Architecture

Two distinct concepts:

- **My Vendors** — application-owned vendor records saved by Wedding Members
- **Vendor Discovery** — external business search powered by Google Places

---

# 34. Vendor Discovery Flow

```text
Wedding Member
      ↓ Choose Vendor Category
      ↓ Choose Location (default = wedding location)
      ↓ Next.js Backend  (server-side API key)
      ↓ Google Places API
      ↓ Return Results  (with Google attribution)
```

Requests originate from the backend only, which protects credentials and allows validation, rate limiting and later caching. Search is available only to authenticated members.

A daily quota cap and a billing budget alert are configured in Google Cloud so a runaway loop cannot produce a surprise bill.

---

# 35. Wedding Location Data

Wedding location is stored as structured information rather than free text:

```text
formattedAddress
city
state
country
latitude
longitude
googlePlaceId
```

Coordinates allow nearby-vendor searches to default sensibly.

---

# 36. Add Discovered Vendor Flow

```text
Google Places Result
        ↓ User clicks "Add to My Vendors"
        ↓ Copy vendor details into an internal Vendor record
        ↓ Member edits and adds family-owned fields
        ↓ Vendor now belongs to the Wedding
```

The copied record includes name, category, phone, address, website and `googlePlaceId`, plus Shaadioo-owned fields: contact person, agreed cost, related events, notes.

After this point the Vendor record does not depend on Google remaining available.

**Recorded risk.** Google Maps Platform terms restrict long-term storage of most Places content; the place ID is the documented exception. Copying details is a deliberate V1 trade-off for a portfolio project, chosen for offline resilience and zero per-view cost. It is **not** a compliant pattern for a commercial launch and must be revisited before Shaadioo is offered publicly. The alternative — store the place ID and fetch details at view time — is recorded in `PRD.md` §9.17 as the compliant path.

Google attribution is displayed on the discovery results screen.

---

# 37. Photo Storage Architecture

Image files are never stored in MongoDB.

```text
MongoDB          → Photo metadata
Cloudflare R2    → Image binaries
```

Each photo produces **two** stored objects and no originals:

| Object | Purpose | Approx. size |
|---|---|---|
| `display` | Longest side ≤ 2560 px | 0.5–1 MB |
| `thumb` | Grid thumbnail | 20–60 KB |

Photo metadata in MongoDB:

```text
weddingId
eventId?
displayKey
thumbKey
fileName
mimeType
size
width / height
uploaderType (MEMBER | GUEST)
uploaderName?   (optional, guest-supplied)
featured        (boolean, max 12 per wedding)
createdAt
```

**Why derivatives instead of originals.** Storing originals was measured against two product requirements and failed both:

- A grid of 30 originals at up to 10 MiB is over 100 MB on a guest's phone, which breaks §3.6.
- 2,000 originals is roughly 20 GB per wedding against a ~2 GB budget (PRD §9.22).

---

# 38. Why Direct-to-R2 Uploads

Large files do not travel through the Vercel backend.

```text
Phone
  ↓ Request upload permission
Next.js API
  ↓ Reserve quota, generate signed upload URL(s)
Phone
  ↓ Direct upload
Cloudflare R2
```

---

# 39. Photo Upload Flow

```text
Guest / Member
   ↓ Client-side: decode (HEIC → JPEG/WebP), resize to display + thumb
   ↓ POST request for upload URLs (per photo: display + thumb)
   ↓ Validate gallery access / member session
   ↓ Validate declared metadata (type, size, count)
   ↓ Reserve wedding photo quota atomically (§97)
   ↓ Return short-lived signed URLs for staging keys
   ↓ Browser uploads directly to R2 staging keys
   ↓ Notify backend
   ↓ Server verifies length, MIME and format signature, pinned to the ETag
   ↓ R2 copy staging → final keys
   ↓ MongoDB atomically publishes the photo row
```

HEIC is decoded in the browser before the signature check, so the server never has to accept HEIC. If decoding fails on an old device, the upload is rejected with a clear message rather than silently storing an unviewable file.

For members, session authorization is used. For guests, the gallery token is used.

If quota reservation fails, no upload URL is issued and the user is told the gallery is full.

---

# 40. Upload Security

Guest uploads are anonymous, so upload security matters.

The backend validates:

- Allowed MIME types (JPEG, PNG, WebP after client-side conversion)
- Maximum file size (§97)
- Number of files per request (§97)
- Per-device and per-IP rate limits (§97)
- Gallery token validity and the guest-upload switch
- Upload URL expiry (short-lived)

Signed URLs are narrowly scoped to a single staging key. Guests never receive broad bucket permissions. Server-side verification of the actual bytes (length, MIME, 16-byte format signature, ETag-pinned) is what is trusted; the client's declared metadata is not.

---

# 41. Photo Moderation

No moderation workflow in V1.

```text
Upload → Gallery
```

Any Wedding Member can delete a photo, and deletions are recorded in the activity log (§96). The website glimpse is featured-only (§26), so an unmoderated upload can never reach the public website.

---

# 42. Photo Viewing and Delivery

- **Gallery grid** loads `thumb` objects only, lazily, with cursor pagination.
- **Viewer** loads the `display` object for the selected photo.
- **Download** serves the `display` object. Originals are not retained, and this is stated in the upload UI so guests are not misled.

Private photo objects use unguessable keys and are served directly from R2. Signed, expiring read URLs were considered and rejected for V1: they break browser caching and expire mid-scroll on a slow connection, which fails §3.6. The gallery **page** remains gated by the gallery token; individual object URLs are unguessable but bearer-accessible.

Because private photos bypass Next's public image optimiser, the browser-side derivative pipeline (§37) is what makes the gallery fast — it is load-bearing, not an optimisation.

---

# 43. Livestream Architecture

No streaming infrastructure is built.

```text
Wedding Settings → YouTube URL → Validate → Store video identifier
   → Wedding Website → Embedded YouTube Player
```

Accepted URL formats: `youtube.com/live/…`, `youtube.com/watch?v=…`, `youtu.be/…`.

Shaadioo is responsible only for displaying the stream.

---

# 44. Email Architecture

Resend is the email delivery provider.

| Category | Type | Path |
|---|---|---|
| Password reset | Transactional | Immediate (§46) |
| Member invitation | Transactional | Immediate (§46) |
| Single guest invitation | Transactional | Immediate (§46) |
| Bulk guest invitations | Campaign | Job queue (§49) |
| RSVP reminders | Campaign | Job queue (§49) |

---

# 45. Internal Email Abstraction

```text
Business Module → Email Service → Resend Adapter → Resend API
```

Business code never calls the Resend SDK directly. This centralizes templates, eases testing, allows provider replacement and gives consistent error handling.

---

# 46. Immediate Emails

Password reset, a single member invitation and a single guest invitation are sent synchronously. These do not justify background infrastructure.

---

# 47. Bulk Email Problem

A wedding may contain up to ~1,000 guests. "Send invitations to all guests" must not attempt hundreds of provider calls inside a user-facing request.

Two external limits shape this, and both are real constraints rather than theoretical ones:

| Limit | Value | Effect |
|---|---|---|
| Vercel Cron (Hobby) | Once per day per job; fires anywhere within the scheduled hour | The queue drains once a day |
| Resend (Free) | 100 emails/day, 3,000/month | At most 100 emails leave per day regardless of batching |

Consequence for V1: a 300-guest bulk invitation takes roughly 4 days to send fully. This is acceptable for the pilot because most Indian guests receive their link through WhatsApp share (PRD §9.14), and email is a secondary channel.

The UI must therefore be honest about progress rather than claiming "sent" (§49).

---

# 48. Lightweight Background Email Architecture

Rather than Redis, BullMQ, RabbitMQ, Kafka or a dedicated worker server, V1 uses:

```text
MongoDB  +  Vercel Cron  +  Small Resend batches
```

---

# 49. Email Job Flow

```text
Admin
  ↓ Send invitations to N guests
  ↓ Next.js API
  ↓ Create Email Jobs (PENDING)
  ↓ Return to user with an honest queued state
```

Background:

```text
Vercel Cron (daily)
    ↓ Protected processing endpoint (§54)
    ↓ Compute today's remaining quota, minus transactional reserve
    ↓ Fetch pending email jobs up to that allowance
    ↓ Atomically claim / mark PROCESSING
    ↓ Send via Resend batch API (up to 100 per call)
    ↓ Update job status
```

The UI shows queued progress, for example "120 of 300 sent, the rest are queued", and never reports a queued job as delivered.

---

# 50. Email Job States

```text
PENDING → PROCESSING → SENT
                    ↘ FAILED
```

Metadata: `attempts`, `lastAttemptAt`, `errorMessage`, `sentAt`, `weddingId`, `guestId`.

Jobs are wedding-scoped like every other record, so one wedding's campaign cannot read or affect another's.

---

# 51. Batch Size and Quota Reserve

Two separate numbers, both configurable:

| Setting | Default | Reason |
|---|---|---|
| Emails per processing cycle | 80 | Fits within the provider's daily quota |
| Transactional reserve | 20/day | Password resets and member invites must never be starved by a campaign |
| Resend batch API call size | up to 100 | One API call, not one call per email |

The reserve is the important one. Without it, a 300-guest campaign can consume the entire daily quota and lock a parent out of their account with no way to reset their password.

Batch sizes also protect serverless execution limits and application reliability.

---

# 52. Email Retries

```text
Attempt 1 → Fail
Attempt 2 → Fail
Attempt 3 → Fail
Mark FAILED
```

Retries do not continue forever. Duplicate delivery is avoided through careful job-state handling and provider-level idempotency where available. Failed jobs are visible to members with a manual retry action.

---

# 53. Concurrency Protection for Background Jobs

If two executions overlap, the same email must not be sent twice.

```text
PENDING --atomic claim--> PROCESSING
```

Only one processor can successfully claim a job. Claims carry a lease timestamp so that a job orphaned by a crashed run is reclaimed rather than stuck in PROCESSING forever.

Vercel documents cron delivery as best-effort, so handlers must be idempotent for missed or duplicate invocations.

---

# 54. Scheduled Job Endpoints

Vercel Cron calls protected internal routes:

```text
/api/internal/jobs/email        — drain the email queue
/api/internal/jobs/retention    — delete photos past retention (§98)
/api/internal/jobs/cleanup      — remove orphaned staging objects
```

These endpoints must not be publicly executable. Each requires a secret known only to the application and the scheduler, passed as a header and compared in constant time.

**V2 upgrade path.** Because these are ordinary authenticated HTTP endpoints, moving off the once-per-day limit requires no code change: an external HTTP scheduler calls the same route every few minutes. This is the planned V2 change and is the reason the schedule is not hard-wired into business logic.

---

# 55. Database Connection Architecture

MongoDB Atlas is accessed through Mongoose with a reusable connection abstraction:

```text
Application → Mongo Connection Manager → Connection Pool → MongoDB Atlas
```

Opening a new connection per request is avoided. In a serverless runtime the connection is cached across invocations of a warm instance, and pool size is kept small so that many concurrent instances cannot exhaust the cluster's connection limit.

---

# 56. Database Design Philosophy

Do not create one giant embedded Wedding document:

```text
Wedding {
  thousandsOfGuests: [...],
  thousandsOfPhotos: [...],
  allTasks: [...],
  allExpenses: [...]
}
```

Major entities have separate collections:

```text
users
sessions
password_resets
weddings
wedding_memberships
member_invitations

events
tasks

guests

vendors
expenses

photos

photo_uploads
email_jobs
activity_logs
rate_limits
schema_migrations
```

The full catalogue, fields and indexes are in `DATABASE_DESIGN.md`.

---

# 57. API Architecture

```text
/api/auth/*          /api/expenses/*
/api/wedding/*       /api/vendors/*
/api/members/*       /api/gallery/*
/api/events/*        /api/livestream/*
/api/tasks/*         /api/activity/*
/api/guests/*
/api/invitations/*
```

Public token routes live under `/api/public/*`. Infrastructure endpoints live under `/api/internal/*`.

The complete endpoint list, request and response shapes, error codes and rate limits are in `API_DESIGN.md`. The wedding is never part of a URL (API-01).

---

# 58. API Layer Responsibilities

Route handlers perform authentication, authorization, input parsing, Zod validation, service calls, error mapping and HTTP responses. They contain no complicated business rules.

---

# 59. Service Layer Responsibilities

Business services contain domain rules, business validation, cross-entity validation, workflow coordination and repository operations.

```text
GuestService.createGuest()
TaskService.assignTask()
WeddingService.createWedding()
InvitationService.submitRSVP()
GalleryService.createUploadPermission()
ActivityService.record()
```

Every repository call is wedding-scoped by construction: the wedding filter comes from the request context, so a handler cannot forget it.

---

# 60. Validation Strategy

Zod validates external inputs at the system boundary: signup, event creation, task creation, guest creation, CSV import rows, RSVP submission, expense creation, vendor creation, upload requests.

Mongoose schemas additionally protect database integrity. The two layers serve different purposes.

---

# 61. Error Handling

```text
VALIDATION_ERROR
UNAUTHENTICATED
FORBIDDEN
NOT_FOUND
CONFLICT
RATE_LIMITED
INTERNAL_ERROR
```

API responses never expose internal stack traces. Guest-facing failures use generic "unavailable" states so an invalid token cannot be distinguished from a deleted one.

---

# 62. Logging

V1 uses simple logging: application logs, Vercel runtime logs and Atlas operational information.

Failures are logged with `requestId`, `userId`, `weddingId`, `operation`, `error`.

Never logged: passwords, session tokens, guest invitation tokens, gallery tokens, reset tokens, or any request path containing a token.

---

# 63. No External Observability Platform in V1

V1 does not introduce Sentry, Datadog, New Relic or PostHog (ADR-16).

Accepted consequence: client-side failures — HEIC decode, browser resize, upload retries on a weak connection — are invisible to server logs. Two compensations are required instead:

1. Upload failures surface a clear, actionable message to the guest with a retry action.
2. Upload outcomes are recorded server-side as counts (requested / published / failed per wedding), so a pilot problem is at least visible in aggregate.

The architecture must not prevent adding a platform later.

---

# 64. Security Architecture

Primary areas:

1. Authentication security
2. Authorization
3. Tenant isolation
4. Guest-token security
5. Upload security
6. Input validation
7. Rate limiting
8. Secret management
9. External API security
10. Guest personal data handling

---

# 65. API Authorization

Private routes require a valid session. Services never trust a `weddingId` supplied by the frontend as proof of access. Wedding identity is always derived from the authenticated membership.

---

# 66. Object-Level Authorization

```text
PATCH /api/events/123
```

The existence of event `123` is not enough. The backend verifies:

```text
event._id = 123  AND  event.weddingId = currentWeddingId
```

This applies to events, tasks, guests, vendors, expenses, photos, activity entries and every other wedding-owned resource.

---

# 67. Rate Limiting

Most sensitive endpoints:

```text
POST /api/auth/login
POST /api/auth/signup
POST /api/auth/forgot-password
POST /api/public/invite/:token/rsvp
POST /api/public/gallery/:token/upload-request
```

V1 uses the MongoDB-backed counter mechanism with HMAC counter keys, avoiding a separate infrastructure dependency. Rate-limiting architecture can evolve independently of business services.

---

# 68. Secret Management

Server-side environment configuration only:

```text
MongoDB URI
R2 credentials
Resend API key
Google Places key
Session secret
Cron secret
```

These values never appear in browser bundles.

---

# 69. Google Places Security

```text
Browser → Shaadioo API → Google Places API
```

This protects credentials, allows request validation, centralizes usage and enables later caching. Quota caps and billing alerts are configured at the Google Cloud project.

---

# 70. File Security

R2 buckets are never publicly writable. Uploads use narrowly scoped, expiring signed URLs bound to a single staging key. Development and production use separate bucket-scoped credentials. Bucket CORS allows only the application origins, the methods actually needed, and `Content-Type`.

---

# 71. Data Privacy

Private wedding-management information is available only to Wedding Members. Guest invitation pages expose only that invitation's data. The website exposes only published information. The gallery exposes only gallery content.

**Guest personal data.** Shaadioo stores names, phone numbers and email addresses of people who never signed up. Only the fields listed in the PRD are collected, they are never shared with third parties, and they are permanently removed when a wedding is deleted (§98).

---

# 72. Performance Strategy

- Proper MongoDB indexes
- Pagination
- Connection reuse
- Direct file uploads
- Browser-side image derivatives
- Efficient API queries
- Small email batches

---

# 73. Pagination

Guests, photos, tasks, expenses, vendors and activity entries are always paginated.

```text
GET /api/guests?cursor=...&limit=50
```

Photos use cursor pagination because the gallery is append-heavy during an event.

---

# 74. MongoDB Indexing

**Rule: every wedding-scoped compound index begins with `weddingId`.** This matches the access pattern created by §15 and makes the isolation filter free rather than costly.

Indexes are needed for:

```text
weddingId (+ secondary fields)
users.email (unique)
wedding_memberships.userId (unique — enforces one wedding per user)
session token hash
guest invitation token
gallery token
wedding slug (unique)
guests (weddingId, invitedEvents.eventId) (multikey)
event date
task due date
RSVP status
email job status + claim lease
photos (weddingId, createdAt) for cursor pagination
activity_logs (weddingId, createdAt)
```

The complete index list, and the exceptions to the `weddingId`-first rule, are in `DATABASE_DESIGN.md` §4–§6.

---

# 75. Caching

No Redis layer initially. V1 relies on efficient MongoDB queries, Next.js caching where clearly appropriate, and browser/CDN caching for static assets and photo objects.

The wedding website is a good candidate for cached rendering revalidated when members edit content; the invitation page is per-token and always dynamic.

---

# 76. Realtime Updates

No WebSockets, SSE or live collaboration in V1. Changes appear on navigation, refresh or normal refetching.

Concurrent edits resolve as **last write wins** (PRD Rule 8), except where an atomic version check is explicitly required (RSVP capacity, photo quota).

---

# 77. Deployment Architecture

```text
                         Internet
                            ▼
                          Vercel
                    Next.js Application
         ┌──────────────────┼────────────────────┐
         ▼                  ▼                    ▼
 MongoDB Atlas       Cloudflare R2            Resend
                            │                    ▼
                            ▼                  Email
                    Google Places API
```

---

# 78. Environment Separation

```text
Local Development
Production
```

A staging environment is added when needed. Each environment has isolated credentials, an isolated Atlas database and an isolated R2 bucket (`shaadioo-dev`, `shaadioo-prod`). Preview deployments require their own configuration.

Production data must never be used during local development.

---

# 79. Deployment Simplicity

No dedicated backend server, Kubernetes, ECS, Docker requirement, load balancer configuration, manual Node cluster or microservice deployment. Vercel manages runtime and HTTP scaling.

---

# 80. Scaling Strategy

## Stage 1 — Initial launch

```text
Next.js + MongoDB Atlas + R2 + Resend + Google Places
```

No additional infrastructure.

## Stage 2 — Increasing usage

Optimize indexes, query design, pagination, R2 delivery, email batching and API rate limits. Move the job scheduler to an external HTTP scheduler (§54) and Resend to a paid tier.

## Stage 3 — Significant scale

Only then consider a dedicated job queue, Redis, a specialized worker service, server-side image processing, CDN changes, read-heavy caching and search infrastructure.

---

# 81. Failure Handling

The system assumes external services can fail: MongoDB unavailable, Resend errors, Google Places unavailable, R2 upload failure, invalid YouTube link. Failures degrade gracefully.

---

# 82. Resend Failure

Single transactional email:

```text
Request → Resend failure → Return appropriate error → Allow retry
```

Bulk email:

```text
Email Job → Failure → Retry → Eventually FAILED → Member-visible retry action
```

Quota exhaustion is not an error: remaining jobs stay PENDING and drain on the next run.

---

# 83. R2 Upload Failure

- Do not publish photo metadata
- Release any reserved quota
- Allow the user to retry
- Display a clear upload failure state

If an object uploads but metadata creation fails, an orphaned staging object may exist. The cleanup job (§54) removes staging objects older than a defined age.

---

# 84. Google Places Failure

Vendor Discovery fails independently:

```text
"Vendor discovery is temporarily unavailable."
```

All other wedding-management functionality stays usable, and saved vendors are unaffected because their details are stored locally (§36).

---

# 85. YouTube Failure

An invalid or unavailable livestream must not break the website. The renderer hides the player, or shows a **Watch on YouTube** link when embedding is disabled by the video owner.

---

# 86. Data Consistency

Transactions are used only where multiple related writes must succeed together:

- **Create wedding:** create Wedding + create initial Admin membership
- **Accept member invitation:** create Membership + mark invitation accepted
- **Publish photo:** quota reservation + photo row (see §97 for the ordering rule)

Not every operation requires a transaction.

---

# 87. Soft Delete vs Hard Delete

Decided for V1:

| Entity | Policy |
|---|---|
| Tasks, expenses, vendors, events | Hard delete |
| Photos | Hard delete: R2 objects + metadata |
| Wedding members | Membership removed; activity log retains the historical record |
| Activity log entries | Never deleted or edited |
| Wedding | **Hard delete**, via a background job (§98) |

Weddings are hard deleted rather than soft deleted because of §71: guest phone numbers and emails belong to people who never signed up, and "deleted" must mean removed. Accidental deletion is guarded by a typed confirmation in the UI, not by retaining the data.

---

# 88. External Dependencies

| Service | Role |
|---|---|
| MongoDB Atlas | Primary application data |
| Cloudflare R2 | Wedding media |
| Resend | Email |
| Google Places | Vendor discovery |
| YouTube | Livestream embedding |
| Vercel | Hosting and scheduled execution |

Coupling is minimized through internal abstractions.

---

# 89. Internal Integration Abstractions

```text
EmailService            → Resend
StorageService          → Cloudflare R2
VendorDiscoveryService  → Google Places
SchedulerEndpoints      → Vercel Cron (V1) / external scheduler (V2)
```

Third-party SDKs never leak into business logic.

---

# 90. Testing Considerations

- **Unit tests:** business services and utility logic
- **Integration tests:** API + database behaviour
- **Authorization tests:** cross-wedding isolation (mandatory, §91)
- **Guest token tests:** invitation and gallery security
- **End-to-end tests:** signup → create wedding → add event → add guest → send invite → RSVP

---

# 91. Critical Security Tests

These must exist and must pass in CI:

```text
Wedding A user cannot fetch Wedding B event.
Wedding A Manager cannot modify Wedding B task.
Manager cannot manage Wedding Members.
Manager cannot read the activity log.
Final Admin cannot be removed or demoted.
Guest token cannot expose another guest.
Guest cannot exceed allowed attendee count.
Guest cannot RSVP after the deadline.
Regenerated guest token invalidates the old link.
Invalid gallery token cannot upload.
Gallery upload rejected when guest uploads are disabled.
Photo quota cannot be exceeded by concurrent uploads.
Expired reset token cannot reset password.
Unpublished wedding website returns not-found.
```

---

# 92. Important Architectural Decisions

**ADR = Architecture Decision Record.** Each entry below records one significant technical decision in a fixed shape:

- **Decision** — what was chosen.
- **Reason** — why it beat the alternatives.
- **Consequence / Constraint** — what it costs, or what must now be done because of it.

The consequence line is the point of the format. It is what tells a future reader (including you) that a limitation was chosen knowingly rather than missed. ADRs are numbered and never renumbered; a decision that is later reversed gets a new ADR that supersedes the old one, and the old one stays in place.

## ADR-01: Modular Monolith
**Decision:** One application rather than microservices.
**Reason:** Product complexity does not justify distributed infrastructure.

## ADR-02: Next.js Full-Stack
**Decision:** Next.js for frontend and backend.
**Reason:** Avoid a separate Express/Nest application while retaining explicit REST endpoints.
**Consequence:** No long-running worker process, which is what makes the scheduling constraints in §47 real.

## ADR-03: MongoDB Atlas
**Decision:** MongoDB Atlas with Mongoose.
**Reason:** Fits product preference, document-oriented data and managed production infrastructure.
**Constraint:** Unbounded or independently queried relationships (`wedding_memberships`, every wedding-owned entity) live in their own collections with `weddingId`-first indexes. Only small, bounded, always-read-together data is embedded (`DATABASE_DESIGN.md` §3.1).

## ADR-04: Custom Authentication
**Decision:** Build email/password auth internally.
**Reason:** Control and educational clarity without Better Auth, Clerk or Auth0.
**Constraint:** Use established password hashing and secure session practices, never custom cryptography.

## ADR-05: No Email Verification
**Decision:** Users can create or join weddings immediately after signup.
**Reason:** Reduce friction and V1 complexity.

## ADR-06: Wedding-Level Multi-Tenancy
**Decision:** Wedding is the tenant boundary.
**Reason:** Almost all private product information belongs to a Wedding.

## ADR-07: Cloudflare R2
**Decision:** Store media in R2.
**Reason:** Avoid large binaries in MongoDB, support direct uploads, and avoid egress charges on a download-heavy gallery.

## ADR-08: Guest Token Access
**Decision:** Guests do not authenticate.
**Reason:** Keep RSVP and photo sharing frictionless.

## ADR-09: Resend
**Decision:** Resend as email provider.
**Reason:** Simple transactional integration suitable for V1.
**Constraint:** Free-tier quota of 100/day shapes campaign behaviour (§47, §51).

## ADR-10: MongoDB-Backed Email Jobs
**Decision:** MongoDB + scheduled drain + small batches.
**Reason:** Avoid Redis and dedicated job infrastructure at this scale.

## ADR-11: Google Places Vendor Discovery
**Decision:** Do not build a proprietary vendor marketplace.
**Reason:** Google Places provides sufficient discovery for V1.

## ADR-12: Vercel Hosting
**Decision:** Deploy the Next.js monolith on Vercel.
**Reason:** Low operational overhead and native Next.js support.
**Consequence:** Hobby cron runs once per day, which is why §54 keeps the schedule external to business logic.

## ADR-13: Guest-Level RSVP Storage
**Decision:** Store the RSVP answer on the guest record; derive per-event headcounts.
**Reason:** The V1 guest answers once, so a single stored answer matches the product exactly and keeps the write path simple.
**Consequence:** Per-event RSVP in V1.1 requires a data migration. Accepted knowingly (§31).

## ADR-14: Copy Vendor Details on Add
**Decision:** Copy Google Places details into the Shaadioo vendor record rather than storing only the place ID.
**Reason:** Offline resilience, no per-view API cost, and the family can edit the details.
**Consequence:** Diverges from Google Maps Platform storage terms. Acceptable for a portfolio project; must be revisited before public launch (§36).

## ADR-15: Browser-Side Image Derivatives
**Decision:** Resize and convert in the browser; store a display image and a thumbnail; do not store originals.
**Reason:** Keeps the gallery usable on a budget phone over 4G and keeps storage inside the product's 2,000-photo budget, without a server-side image pipeline.
**Consequence:** Guests cannot download full-resolution originals. Stated in the upload UI.

## ADR-16: No External Observability in V1
**Decision:** No Sentry or equivalent platform.
**Reason:** Deliberate scope control for V1.
**Consequence:** Client-side upload failures are not centrally visible; compensated by clear user-facing errors and server-side outcome counters (§63).

## ADR-17: Invited Events Embedded on the Guest
**Decision:** Store each guest's invited events as `invitedEvents: [{ eventId }]` on the guest document. No `guest_invitations` collection.
**Reason:** With RSVP stored on the guest (ADR-13), a separate collection would contain only guest–event pairs, adding writes and a transaction to every guest edit for no benefit. A wedding has at most 30 events, so the array is small and bounded.
**Consequence:** Items are objects, not bare ids, so V1.1 per-event RSVP adds fields to each item in one migration. Deleting an event is a single `$pull` across the wedding's guests. Supersedes the `guest_invitations` collection in revision 2.

---

# 93. Architecture Explicitly Excluded from V1

Microservices · separate Express backend · NestJS · GraphQL · Kafka · RabbitMQ · Redis · BullMQ · WebSockets · Server-Sent Events · Kubernetes · ECS · Docker-based production deployment · Elasticsearch · Better Auth · Clerk · Auth0 · email verification · photo moderation queue · server-side image processing · original-resolution storage · video uploads · external observability platform · product analytics platform · paid storage plans · shipped translations.

---

# 94. Final System Summary

Shaadioo V1 operates as a **TypeScript modular monolith built with Next.js**, with the same application serving the user interface and explicit REST backend APIs.

Authenticated bride, groom and family members interact through server-side sessions and secure cookies. Every Wedding is an isolated tenant, and that isolation is enforced in backend queries and verified by mandatory tests.

Guests interact without accounts through unpredictable invitation and gallery tokens.

MongoDB Atlas persists application data through Mongoose. Cloudflare R2 stores wedding photos as browser-generated display images and thumbnails, uploaded directly through short-lived signed URLs, verified server-side before publication and capped per wedding.

Resend delivers transactional email immediately; invitation and reminder campaigns run through a MongoDB-backed job queue drained on a schedule, within a daily quota that reserves capacity for transactional mail.

Google Places powers vendor discovery, with selected vendors copied into Shaadioo-owned records.

Wedding websites are rendered by Next.js from stable, unlisted slugs using predefined themes, and publish only what members explicitly publish.

YouTube provides livestream infrastructure; Shaadioo only embeds the configured stream.

The entire application deploys to Vercel without additional servers, containers, queues, cache clusters or microservices.

> **Simple architecture, strong domain boundaries, secure wedding isolation, low operational overhead, and enough scalability to support a real publicly available wedding-management product.**

---

# 95. Next Design Documents

1. **Database Design** — collections, relationships, embedding vs referencing, indexes, constraints, tokens, sessions, jobs
2. **API Design** — REST endpoints, request/response structures, authentication and authorization rules, error responses
3. **Application / Module Design** — codebase organization, module boundaries, services, repositories, validation, shared utilities
4. **Frontend Architecture** — routes, layouts, server/client boundaries, data fetching, state management, forms
5. **Security Design** — authentication implementation, sessions, CSRF, tokens, rate limiting, upload security
6. **Deployment Design** — environments, environment variables, Atlas, R2, Resend, scheduling, release workflow

---

# 96. Activity Log Architecture

An append-only record of important changes, visible to Admins only.

## Logged actions

| Domain | Actions |
|---|---|
| Members | invited, joined, removed, role changed |
| Guests | created, edited, deleted, imported (with count), token regenerated |
| Expenses | created, edited, deleted |
| Photos | deleted |
| Events | deleted |
| Wedding | website published / unpublished |

## Entry shape

```text
weddingId
actorUserId
actorName        (denormalized, so a removed member still reads correctly)
action
targetType / targetId / targetLabel
changes?         (field: before → after, for edits)
createdAt
```

## Rules

- **Append-only.** No API writes updates or deletes to this collection; there is no service method to do so.
- **Admin-only read**, paginated, newest first.
- **Actor name is denormalized** so history survives member removal.
- **Written in the same operation as the change** it records, so a successful change is always logged.
- Guest actions (RSVP, photo upload) are not recorded here; they are visible in their own modules.

This is what makes "any Admin can do anything" (PRD §4.1) traceable rather than unaccountable.

---

# 97. Photo Limits and Quota Enforcement

## Limits

| Limit | Value |
|---|---|
| Accepted input formats | JPEG, PNG, WebP, HEIC (HEIC converted in-browser) |
| Max size per selected file | 15 MB |
| Stored display image | Longest side ≤ 2560 px |
| Stored thumbnail | Grid-sized derivative |
| Originals | Not stored |
| Photos per upload request | 30 |
| Photos per device per day | 150 |
| Photos per wedding | 2,000 (members and guests combined) |
| Featured photos per wedding | 12 |
| Retention | 12 months after the wedding date (§98) |

## Wedding cap: atomic reservation

Checking a count and then inserting is wrong under the exact condition this product creates — 150 guests scanning the QR code within ten minutes of each other. A read-then-write check overshoots the cap.

The reservation happens **before** upload URLs are issued:

```text
Request to upload N photos
        ↓
Conditional atomic increment on weddings.counters.photoSlotsUsed
  filter: { _id, status: ACTIVE, counters.photoSlotsUsed: { $lte: 2000 - N } }
  update: { $inc: { counters.photoSlotsUsed: N } }
        ↓
   matched?
   ├── no  → 409, gallery full, no URLs issued
   └── yes → issue signed URLs for N photos
              ↓
         upload + verify + publish
              ↓
         failure or abandonment → release reservation ($inc negative)
```

`photoSlotsUsed` counts published photos plus reserved uploads. It is one of exactly three stored counters (`adminCount`, `photoSlotsUsed`, `featuredPhotoCount`); every dashboard number is computed on read. A number is stored only when it enforces a limit under concurrency — see `DATABASE_DESIGN.md` §9 for why counting inside a transaction is not enough.

Abandoned reservations are released by the cleanup job (§54) alongside orphaned staging objects.

## Per-device limits for anonymous guests

Identifying an anonymous uploader is imperfect, so two mechanisms are combined:

| Mechanism | Purpose | Weakness |
|---|---|---|
| Browser-stored device ID | Primary per-device daily limit | Cleared in private mode |
| Per-IP ceiling (generous) | Safety net against scripted abuse | Venue Wi-Fi and carrier NAT share one IP |

The per-IP ceiling must be generous precisely because an entire reception shares one venue connection and Indian mobile carriers place many subscribers behind one address. It is an abuse backstop, never the primary limit.

---

# 98. Wedding Deletion and Photo Retention

## Wedding deletion

Triggered by an Admin from Settings → Danger Zone, confirmed by typing the wedding name.

```text
Mark wedding DELETING (blocks all access immediately)
        ↓ enqueue deletion job
        ↓ delete R2 objects in batches (display + thumb)
        ↓ delete photo_uploads, photos, email_jobs, activity_logs,
          guests, tasks, expenses, vendors, events,
          member_invitations, wedding_memberships
        (user accounts and sessions are not wedding data and remain)
        ↓ delete the wedding document
```

Access is revoked at the moment of the request, not at the end of the job, so a large gallery does not leave data reachable while it drains.

Deletion is irreversible by design (§87, §71).

## Photo retention

A daily job deletes photos belonging to weddings whose wedding date is more than 12 months past, removing R2 objects and metadata together.

Retention is stated in the upload UI and the PRD so families are not surprised. A retention warning email before deletion is a V1.1 candidate, not a V1 requirement.

---

# 99. Backups and Data Durability

MongoDB Atlas free-tier (M0) clusters have **no automated backups**. This is acceptable for local development and unacceptable for a pilot holding a real family's guest list, where the data cannot be reconstructed.

Required before the first pilot wedding:

1. **Either** a paid Atlas tier with automated backups enabled, **or** a scheduled `mongodump` of the production database to durable storage outside Atlas.
2. A verified restore: a backup that has never been restored is not a backup.
3. A documented restore procedure, because a restore will be needed under time pressure during a wedding week.

R2 objects are not separately backed up in V1. Photos are user-generated content that guests still hold on their own phones, so the loss is recoverable; the guest list is not.
