# Shaadioo
## Product Requirements Document

**Version:** V1 (Document revision 3)
**Status:** Ready for System Design
**Product Type:** Responsive Web Application
**Primary Market:** Indian Weddings
**Project Type:** Portfolio project, piloted with real weddings

---

# 0. Change Log

## Revision 2 (changes from the original "Make My Marriage" draft)

1. **Name** changed to **Shaadioo**. All example URLs updated (`shaadioo.com` is a placeholder until the domain is verified).
2. **RSVP storage (9.11):** guests still answer once, but the answer is saved against every event they are invited to, so per-event RSVP in V1.1 is a UI change, not a data migration.
3. **Signup via invitation (9.1, 9.2):** members who sign up through an invitation link join that wedding directly and skip wedding creation. Empty weddings can be deleted, so Rule 1 cannot lock anyone out.
4. **Wedding website (9.18):** shows all events, is unlisted (publish toggle, `noindex`, random slug suffix), and shows a gallery glimpse of up to 12 admin-featured photos only.
5. **Vendor discovery (9.17):** uses Google Places with live data. Only the place ID and family-owned fields are stored. Server-side API key, attribution, quota and billing alert required.
6. **Photo limits defined (9.22):** photos only, 15 MB max upload, resized to 2560 px, 2,000 photos per wedding, per-upload and per-device caps, HEIC supported, 12-month retention.
7. **Activity log (9.26)** moved from Non-Goals into V1 (minimal, admin-visible).
8. **Expenses (9.15):** added optional "Paid by" free-text field.
9. **Guests (9.7):** added optional Side tag (Bride / Groom / Both) and CSV import with a fixed template.
10. **RSVP deadline (9.11):** optional date after which RSVP locks.
11. **Vendors (9.16):** agreed cost shown next to total recorded expenses.
12. **Multilingual (12.6):** English-only UI in V1, but all text externalized for translation from day one.
13. **YouTube fallback (9.24):** "Watch on YouTube" link when embedding is disabled.
14. **Wedding deletion (9.25, 13):** admins can delete a wedding and all guest data.
15. **Concurrency (Rule 8):** last write wins, stated explicitly.
16. **Success metrics (15)** rewritten for a portfolio project with pilot weddings.
17. **Release strategy (16)** reordered into four milestones around the December pilot, with target dates.

## Revision 3 (aligned with SYSTEM_DESIGN.md)

18. **RSVP storage (9.11)** reverted to guest-level storage, matching the implemented design. Per-event RSVP in V1.1 will require a migration; this trade-off is now stated explicitly.
19. **Vendor discovery (9.17, 9.16)** changed to copy Google details into a Shaadioo-owned vendor record instead of storing only the place ID. The Google terms risk is recorded in the PRD.

---

# 1. Product Overview

## 1.1 Product Name

**Shaadioo**

## 1.2 Product Vision

Shaadioo is a digital wedding management platform that helps couples and their families collaboratively plan and manage an Indian wedding from one place.

Indian weddings involve multiple events, dozens of tasks, many family members, hundreds of guests, vendors, expenses, invitations, photos, and several moving pieces.

Most families currently manage this using a combination of:

- WhatsApp groups
- Excel sheets
- Notes
- Phone calls
- Google Docs
- Paper lists
- Different vendor conversations
- Shared photo folders

Shaadioo brings these activities together inside one structured wedding workspace.

The product should feel like:

> **The operating system for managing an Indian wedding.**

---

# 2. Problem Statement

Planning an Indian wedding is collaborative but highly fragmented.

A typical wedding may involve:

- Bride and groom
- Parents
- Siblings
- Cousins
- Friends
- Multiple wedding events
- Hundreds of guests
- Multiple vendors
- Many expenses
- Invitations and RSVPs
- Wedding photos
- Livestream requirements
- Constant coordination

There is usually no single source of truth.

One family member tracks guests in Excel. Someone else tracks expenses. Tasks are discussed inside WhatsApp groups. Vendor details are stored in individual phones. Invitations are shared separately. Wedding photos get scattered across dozens of devices after the wedding.

Shaadioo aims to solve this by providing one central wedding workspace.

---

# 3. Target Users

## 3.1 Primary Users

- Bride
- Groom
- Parents
- Siblings
- Close family members
- Trusted friends helping organize the wedding

These users create accounts and access the wedding management dashboard.

They are collectively called **Wedding Members**.

Relationship (e.g. "Bride's Father", "Groom's Cousin") is a **display label** only. Access is controlled by **role**.

---

# 4. User Types

There are two member roles and one guest type in V1.

## 4.1 Admin

Admin has access to the entire wedding workspace.

Admin can:

- Manage wedding information
- Create and manage events
- Create and manage tasks
- Manage guests
- Send invitations
- Track RSVP
- Manage expenses
- Manage vendors
- Discover vendors
- Manage wedding website
- Manage gallery
- Upload photos
- Configure livestream
- Manage Wedding Members
- View activity log
- Delete the wedding

The key difference between Admin and Manager is:

> **Only Admin can manage Wedding Members, view the activity log, and delete the wedding.**

Multiple Admins are supported. Roles are flexible: bride and groom are typically Admins, but parents or friends may also be made Admin.

## 4.2 Manager

Managers are family members or trusted people helping organize the wedding.

Managers can access everything an Admin can, except:

- Add Wedding Members
- Remove Wedding Members
- Change any member's role
- View the activity log
- Delete the wedding

## 4.3 Guest

Guests are **not** Wedding Members and are **not** stored as user accounts.

Guests do not log in. They interact with Shaadioo through secure unique links and the wedding QR code.

A guest may:

- Open their wedding invitation
- View events they are invited to
- RSVP
- Specify how many people are attending
- View wedding information
- View the private wedding gallery (via gallery link / QR)
- Upload wedding photos

---

# 5. Core Product Rules

### Rule 1
One user can belong to only **one wedding** in V1.

### Rule 2
One wedding can have multiple Wedding Members.

### Rule 3
A wedding can have multiple Admins and Managers, and must always have at least one Admin.

### Rule 4
Guests never require accounts.

### Rule 5
The `Wedding` is the primary workspace around which all other product data exists.

### Rule 6
All Admins and Managers see the same wedding data. There are no private expenses, private tasks, side-based permissions, or department-specific permissions. The Side tag on guests is a filter, not a permission.

### Rule 7
The product does not support professional wedding planners managing multiple weddings in V1.

### Rule 8
There is no real-time collaboration. When two members edit the same record, **the last saved change wins**.

### Rule 9
A user who signs up through a member invitation link joins that wedding and is never prompted to create a new wedding.

---

# 6. Product Goals

Shaadioo V1 should allow a family to manage the core activities of a wedding from beginning to end.

The product should enable users to:

1. Set up their wedding.
2. Invite family members to help manage it.
3. Plan multiple wedding events.
4. Create and assign wedding tasks.
5. Maintain a guest list, including CSV import.
6. Send digital invitations by email and WhatsApp share.
7. Collect RSVPs.
8. Track wedding expenses.
9. Maintain vendor information.
10. Discover nearby vendors through Google Places.
11. Publish a simple themed wedding website.
12. Share wedding photos privately.
13. Allow guests to contribute photos.
14. Generate a QR code for photo sharing.
15. Embed a YouTube wedding livestream.

---

# 7. Non-Goals

Shaadioo V1 will NOT include:

- Multiple weddings per user
- Wedding planner business accounts
- Complex role-based permissions
- Side-based (bride/groom) data visibility
- Guest accounts
- Tracking individual people inside an invitation
- Per-event RSVP answers in the guest UI (planned for V1.1; will require a data migration)
- Accommodation management
- Hotel room allocation
- Flight or train tracking
- Airport pickup management
- Vehicle management
- Wedding budget planning, allocation, or limits
- Structured expense splitting between families
- Payment installment tracking
- Vendor payment schedules
- Vendor marketplace transactions, bookings, or payments
- Vendor accounts or vendor logins
- WhatsApp API integration
- SMS integrations
- Push notifications
- In-app notification center
- Real-time collaborative updates
- Drag-and-drop website builder
- Custom domains
- Native livestreaming infrastructure
- Video uploads
- Photo approval / moderation queue
- Storing original full-resolution photos
- Advanced gallery permissions
- Shipped translations (UI is translation-ready only)
- Paid plans or storage upgrades
- AI functionality

These may become future releases.

---

# 8. Primary User Journey

### Step 1: Signup
Bride or groom creates an account.

### Step 2: Create Wedding
User enters bride name, groom name, wedding date, and wedding location. Title and cover image are optional. The creator automatically becomes Admin.

### Step 3: Add Wedding Members
Admin invites parents, siblings, the other partner, and other helpers by email. Each invited person opens the invitation link, creates their own account, and joins the wedding directly.

### Step 4: Add Events
The family creates events from suggested shortcuts (Roka, Engagement, Mehendi, Haldi, Sangeet, Cocktail, Wedding, Reception) or custom events.

### Step 5: Add Tasks
Tasks are created and assigned to Wedding Members.

### Step 6: Add Guests
Guests are imported from the CSV template or added manually, tagged by side, and invited to selected events.

### Step 7: Send Invitations
Unique invitation links are generated and sent by email or shared manually through WhatsApp.

### Step 8: Receive RSVPs
Guests confirm attendance without logging in, before the optional RSVP deadline.

### Step 9: Manage Vendors
Wedding Members store booked vendors, adding them manually or from Google Places discovery.

### Step 10: Track Expenses
Wedding Members record expenses, including who paid.

### Step 11: Publish Wedding Website
The family chooses a theme, features photos for the glimpse, and publishes the unlisted website.

### Step 12: Configure Livestream
The family adds a YouTube Live URL.

### Step 13: Share Wedding QR
A QR code is generated and displayed during the wedding. Guests scan it to view or upload photos.

### Step 14: Wedding Gallery
Organisers and guests contribute photos to a shared private gallery.

---

# 9. Feature Requirements

# 9.1 Authentication

Users should be able to:

- Sign up
- Log in
- Log out
- Reset forgotten passwords by email

Signup requires name, email, and password. Email addresses must be unique.

**Signup via member invitation:** if a user arrives through a member invitation link, the invited email is prefilled, and after signup the user joins that wedding directly with the assigned role.

**Admin-assisted accounts:** for family members without a usable email habit, an Admin may invite them with any email they own and help them set a password on first login. (No phone-based login in V1.)

Guests are excluded from authentication.

---

# 9.2 Wedding Creation

After signing up **without** an invitation, a user who has no wedding is prompted to create one.

Required: bride name, groom name, wedding date, wedding city/location.
Optional: wedding title, description, cover image, name order.

- **Wedding date** must be today or later (in the wedding's timezone). Creating a wedding for a past date is not allowed.
- **Name order:** the couple chooses whether their names appear bride first ("Princi & Akshay") or groom first ("Akshay & Princi"). The default is bride first. The choice applies everywhere the couple's names are shown together and can be changed later in Wedding Details.

Example:

**Akshay ❤️ Princi**
14 February 2027
Dehradun, Uttarakhand

The creator becomes the first Admin.

**Accidental wedding protection:** a wedding with no events, guests, tasks, expenses, vendors, or photos can be deleted by its Admin in one step. After deletion, the user can accept an invitation to another wedding.

---

# 9.3 Wedding Dashboard

The dashboard is the wedding command center. It shows important information without navigating every module.

## Summary Cards

- Days to go
- Number of events
- Tasks completed / total
- Total guest invitations and total people invited
- RSVP responses (attending / not attending / pending)
- Total expenses
- Number of vendors

Example:

**42 Days to Go**

Events: 6
Tasks: 32 / 48 completed
Invitations: 186 (612 people)
RSVPs: 132 responded
Expenses: ₹12,45,000
Vendors: 8

## Dashboard Sections

- **Upcoming Events:** nearest upcoming events
- **Upcoming Tasks:** incomplete tasks approaching due dates
- **Wedding Countdown:** days remaining until the primary wedding date

The dashboard is informational. No advanced analytics are required.

---

# 9.4 Wedding Member Management

Admin accesses **Settings → Wedding Members**.

Admin can:

- Invite member (email + relationship label + role)
- View members and pending invitations
- Resend or cancel a pending invitation
- Remove member
- Change role (Admin / Manager)
- Edit relationship label

Rules:

- Member invitations expire after **7 days** and can be resent.
- The final Admin cannot be removed or demoted.
- Managers cannot access Wedding Member administration.

---

# 9.5 Wedding Events

Wedding Members can create multiple events.

## Event Fields

- Event name
- Date
- Start time
- End time
- Venue name
- Address
- Map link (optional)
- Description
- Dress code
- Cover image

## Suggested Event Shortcuts

Roka, Engagement, Mehendi, Haldi, Sangeet, Cocktail, Wedding, Reception.

Users can also create a **Custom Event**. All events are editable and deletable.

---

# 9.6 Task Management

## Task Fields

- Title
- Description
- Assigned Wedding Member (members only)
- Related Event (optional)
- Due date
- Priority: Low / Medium / High
- Status: To Do / In Progress / Completed

## Task Views

- All Tasks
- My Tasks
- Completed Tasks

Filters: status, event, assigned member, priority.

No comments, attachments, subtasks, or dependencies in V1.

---

# 9.7 Guest Management

A guest record represents **one invitation** (e.g. a family), not every individual.

## Guest Fields

- Name (e.g. "Rajesh Sharma" or "Sharma Family")
- Side: Bride / Groom / Both (optional)
- Email (optional)
- Phone number (optional)
- Maximum people allowed
- Events invited to
- RSVP status
- Number attending
- Invitation sent status
- Notes

## RSVP Status

- Pending
- Attending
- Not Attending

Example: **Rajesh Sharma**, maximum allowed 4, responds "Attending with 3 people". The other family members do not need separate records.

## Guest List Views

Filters: side, event, RSVP status, invitation sent / not sent. Search by name or phone.

## 9.7.1 CSV Guest Import

- Members download a fixed CSV template.
- Columns: `name, side, email, phone, max_people, events, notes` (`events` is a list of event names separated by `|`).
- Before import, a preview shows valid rows, invalid rows with reasons, and **duplicate phone numbers** (within the file or already in the guest list).
- The member can import valid rows and skip the rest.

---

# 9.8 Event-Level Invitations

A guest may be invited to only selected events.

Example, Rajesh Sharma: Mehendi No, Haldi No, Cocktail Yes, Wedding Yes, Reception Yes.

The invitation page displays only the events the guest is invited to.

Note: the public wedding website lists all events (9.18). Event-level invitations therefore control **RSVP and headcounts**, not event privacy.

---

# 9.9 Invitation Links

Every guest receives a secure unique invitation link.

Example: `shaadioo.com/invite/X7K29PQ4M2`

The link identifies the wedding, the guest, and the invited events.

- No login required.
- Tokens must be unpredictable (cryptographically random).
- Guest invitation links do not expire.
- A member can **regenerate** a guest's link; the old link stops working immediately.

---

# 9.10 Digital Invitation

The invitation page displays:

- Couple names
- Wedding branding (current website theme)
- Welcome message
- Invited events with dates, times, venues, and map links
- RSVP form
- RSVP deadline, if set

Example:

**Akshay & Princi**
would love for you to celebrate their wedding with them.

**Wedding**
14 February 2027 · 8:00 PM
XYZ Resort, Dehradun

---

# 9.11 RSVP

Guests respond from the invitation page.

**Will you be attending?** Yes / No

If yes: **How many people will attend?** From 1 up to the maximum set by the organiser. (Allowed 4 → can choose 1–4, never 5.)

## Rules

- In V1 the guest gives **one answer** that applies to all events they are invited to.
- **Storage:** the answer (RSVP status and number attending) is stored on the **guest record**. Per-event headcounts are derived by counting each guest's answer against the events that guest is invited to.
- **Known consequence:** adding per-event RSVP answers in V1.1 will require a data migration of existing RSVPs. This was accepted deliberately in favour of a simpler V1 model.
- The RSVP can be edited later through the same link.
- **RSVP deadline (optional, wedding-level):** after the deadline, the invitation page shows the guest's last response as read-only with a message to contact the family. Members can still edit RSVPs manually.

---

# 9.12 Email Invitations

Members can send invitations by email to guests who have an email address.

The email contains couple names, a short invitation message, the wedding date, and the invitation link.

The system records whether and when an invitation was sent. Members can resend invitations.

Technical note: confirm the email provider's daily sending limits before bulk sends.

---

# 9.13 RSVP Email Reminders

Members can view guests whose RSVP is still Pending and use **Send Reminder to Pending Guests** (email only, guests with email addresses).

No automated scheduled reminders in V1.

---

# 9.14 WhatsApp Sharing

Each guest has a **Share on WhatsApp** button that opens WhatsApp with a pre-filled message containing that guest's invitation link.

No WhatsApp API integration. Shaadioo does not send WhatsApp messages automatically. Sharing through WhatsApp marks the invitation as sent.

---

# 9.15 Expense Tracker

Records money already spent or committed. It is not a budgeting system.

## Expense Fields

- Expense title
- Amount (INR)
- Date
- Category
- Paid by (optional free text, e.g. "Papa", "Groom's family")
- Related Event (optional)
- Related Vendor (optional)
- Notes

## Suggested Categories

Venue, Catering, Photography, Videography, Decoration, Clothing, Jewellery, Entertainment, Invitations, Gifts, Travel, Makeup, Miscellaneous.

Members can add, edit, delete, view, and filter expenses (category, event, vendor, paid by).

## Expense Overview

- **Total Wedding Expense** (e.g. ₹17,42,500)
- Optional breakdown by category

No budget or variance calculations.

---

# 9.16 My Vendors

Members maintain a list of vendors selected for the wedding.

## Vendor Fields

- Vendor name
- Category
- Source: Manual / Google
- Google place ID (Google-sourced vendors only)
- Contact person
- Phone number
- Email
- Address
- Website
- Total agreed cost
- Related Events
- Notes

For Google-sourced vendors, the details are copied into the vendor record when it is added (9.17) and are editable afterwards. All vendor fields are stored and owned by Shaadioo.

## Vendor Cost Check

Each vendor shows **Agreed ₹X · Recorded ₹Y**, where Y is the total of expenses linked to that vendor. No payment schedule is required.

## Vendor Categories

Photographer, Videographer, Venue, Caterer, Decorator, DJ, Makeup Artist, Mehendi Artist, Pandit, Choreographer, Florist, Wedding Planner, Transport, Other.

---

# 9.17 Vendor Discovery

Members can search for local vendors, e.g. **Wedding Photographers near Dehradun**.

Search categories: photographers, wedding venues, caterers, makeup artists, florists, decorators, DJs.

## Data Source: Google Places

Displayed where available: vendor name, rating, address, distance, phone, website, map link.

## Requirements

- Only Wedding Members (logged in) can search.
- Search results are fetched live from Google at search time.
- **Add to My Vendors copies the relevant details** (name, category, phone, address, website, place ID) into a Shaadioo-owned vendor record. After that, the vendor record does not depend on Google remaining available.
- Google attribution is displayed on the discovery results screen.
- The API key is used **server-side only**, never exposed to the browser.
- Search is rate-limited per member.
- A daily quota cap and billing budget alert are configured in Google Cloud.
- If Google is unavailable, discovery shows "Vendor discovery is temporarily unavailable." Saved vendors are unaffected.
- **Known risk:** Google Maps Platform terms restrict long-term storage of most Places content (the place ID is the exception). Copying details is a deliberate V1 choice for a portfolio project, not a compliant pattern for a commercial launch. Revisit before any public launch.

**Add to My Vendors** creates a vendor with Source = Google, copies the fetched details, and lets the member edit them and fill family-owned fields.

Shaadioo does not process vendor bookings or payments.

---

# 9.18 Wedding Website

Each wedding has a hosted, **unlisted** wedding website.

Example: `shaadioo.com/w/akshay-princi-k7x2m9`

## Visibility Rules

- **Publish toggle:** the website is not reachable until published. Unpublishing makes it unreachable again.
- **Unlisted:** pages send `noindex` and are excluded from sitemaps.
- **Slug** is generated from couple names plus a random suffix to prevent guessing.

The website is separate from the private guest invitation and contains general wedding information.

## Website Sections

### Hero
Couple names, wedding date, cover photo.

### Welcome
Short message, optional description.

### Events
**All events:** name, date, time, venue, dress code, map link.

### Gallery Glimpse
Up to **12 photos that members mark as Featured**. Photos never appear on the website automatically. The website does not link to the full gallery.

### Livestream
Embedded YouTube livestream if configured (see 9.24).

---

# 9.19 Wedding Website Themes

Users do not design their website. They select from predefined themes:

- **Classic Indian:** traditional, decorative aesthetic
- **Minimal Elegant:** clean typography, elegant layout
- **Modern Celebration:** contemporary, colourful design

All themes use the same wedding data. Changing theme changes presentation, not content. The invitation page (9.10) uses the selected theme.

Milestone 1 ships one theme; the other two follow (see 16).

---

# 9.20 Wedding Photo Gallery

Each wedding has a private gallery, reached only through the gallery link or QR code. It is not publicly searchable and sends `noindex`.

Wedding Members can:

- Upload photos
- View photos
- Delete photos
- Mark / unmark photos as Featured (max 12)
- Download photos
- Share gallery link
- Turn guest viewing on/off
- Turn guest uploads on/off

Guests with the gallery link can view photos (if viewing is on) and upload photos (if uploads are on). Guests cannot delete photos.

Each photo records: uploader type (member/guest), uploader name (optional for guests), event, upload time.

---

# 9.21 Gallery Albums

Photos can optionally be grouped by event (Mehendi, Haldi, Sangeet, Wedding, Reception, etc.), plus **Other / Wedding Memories**.

When uploading, organisers or guests may select the event.

---

# 9.22 Guest Photo Upload

Guests upload photos without authentication. The experience is designed for mobile first.

## Flow

1. Guest opens gallery/upload link or scans QR.
2. Guest optionally enters their name.
3. Guest selects photos from phone.
4. Guest optionally chooses event.
5. Photos upload with visible per-photo progress.
6. Photos appear in the gallery immediately (no approval).

## Limits (V1)

| Limit | Value |
|---|---|
| Accepted formats | JPEG, PNG, WebP, HEIC |
| Max size per selected file | 15 MB |
| Stored size | Resized in browser to max 2560 px longest side (≈0.5–1 MB) plus a thumbnail |
| Original full-resolution files | Not stored |
| Photos per upload | 30 |
| Photos per device per day | 150 |
| Photos per wedding | 2,000 (members and guests combined) |
| Retention | 12 months after the wedding date |

HEIC files are converted to a web format before storage.

When the wedding reaches 2,000 photos, uploads are blocked with a clear message. Members can free space by deleting photos.

Photos only. Video files are rejected with a clear message.

Uploads use secure, short-lived upload URLs with file type validation on the server.

---

# 9.23 Wedding QR Code

Each wedding has a QR code that opens the guest gallery/upload experience.

Example printed message:

**Share the Memories 📸**
Scan to upload and view photos from Akshay & Princi's wedding.

Members can view, download (PNG), and print/share the QR code.

The QR code uses a **stable URL**, so printed codes keep working. If the link is misused, members turn guest uploads or viewing off (9.20) rather than changing the URL.

---

# 9.24 YouTube Livestream

Members provide a YouTube Live URL. Accepted formats include `youtube.com/live/…`, `youtube.com/watch?v=…`, and `youtu.be/…`.

The wedding website shows the embedded player when configured.

If the video cannot be embedded (embedding disabled by owner), the website shows a **Watch on YouTube** button instead.

Members can add, update, and remove the livestream.

No video streaming infrastructure is built by Shaadioo.

---

# 9.25 Settings

## Wedding Details
Edit bride name, groom name, wedding date, location, cover image, description, RSVP deadline.

## Wedding Members (Admin only)
Manage Admins, Managers, and pending invitations.

## Website
Theme, content, publish status, website link.

## Gallery
Guest viewing on/off, guest uploads on/off, storage used (photos used / 2,000).

## Livestream
YouTube Live URL.

## Activity Log (Admin only)
See 9.26.

## Danger Zone (Admin only)
**Delete wedding:** permanently deletes the wedding and all its data, including guest names, phone numbers, emails, RSVPs, and photos. Requires typing the wedding name to confirm.

## Account (every member)
Edit your name and change your password.

**Delete my account:** any signed-in user can permanently delete their own account. Requires the current password and typing `DELETE` to confirm.

- The user's sessions, password reset tokens and personal details (name, email, password hash) are deleted. The email can be used to sign up again.
- If the user is a member of a wedding, they leave it first, with the same effects as an Admin removing them: access ends immediately and their assigned tasks become unassigned.
- If they are the **only member** of the wedding, the wedding is deleted with the account (same as Delete wedding).
- If they are the **last Admin** and other members remain → blocked; they must make someone else Admin, or delete the wedding, first.
- Records they made inside the wedding (guests, expenses, activity log entries) stay with the wedding; their name on those records is shown as "Former member".

---

# 9.26 Activity Log

A minimal, append-only record of important changes.

## Logged Actions

- Members: invited, joined, removed, role changed
- Guests: created, edited, deleted, imported (with count), link regenerated
- Expenses: created, edited, deleted
- Photos: deleted
- Events: deleted
- Wedding: website published/unpublished

## Each Entry

- Who (member name)
- What (action and record name)
- When
- For edits: changed fields with before and after values

## Rules

- Log entries cannot be edited or deleted by anyone.
- Visible to Admins in **Settings → Activity Log** as a simple, newest-first list.
- Guest actions (RSVP, photo upload) are not logged here; they are visible in their own modules.

---

# 10. Main Application Navigation

**Dashboard**

**Events**

**Tasks**

**Guests**
- Guest List
- Invitations
- RSVP

**Expenses**

**Vendors**
- My Vendors
- Discover Vendors

**Wedding Website**

**Photos**
- Gallery
- Guest Upload
- QR Code

**Live Stream**

**Settings**
- Wedding Details
- Wedding Members
- Activity Log
- Danger Zone

Navigation can be simplified during UI design.

---

# 11. Important Product Relationships

```text
User
  |
Wedding Membership (role, relationship label)
  |
Wedding
  |
  +-- Events
  |
  +-- Tasks (→ assigned member, → event)
  |
  +-- Guests (side, max people, invitation token, RSVP answer)
  |     |
  |     +-- Invited events (→ events)
  |
  +-- Vendors (source, Google place ID, → events)
  |
  +-- Expenses (paid by, → event, → vendor)
  |
  +-- Wedding Website (theme, slug, publish status)
  |
  +-- Gallery (settings)
  |     |
  |     +-- Photos (→ event, featured, uploader)
  |
  +-- Livestream
  |
  +-- Activity Log Entries
```

Exact database modelling is defined in `DATABASE_DESIGN.md`.

---

# 12. Important UX Principles

## 12.1 Wedding First
Every logged-in page clearly shows the current wedding's identity.

## 12.2 Simple Enough for Parents
The dashboard must not feel like enterprise project-management software. A non-technical parent should be comfortable adding a guest, completing a task, recording an expense, and viewing an RSVP.

## 12.3 Mobile Friendly
Members may use desktop, but many workflows happen on mobile. Guest experiences must be mobile-first:

- Invitation viewing
- RSVP
- Photo upload
- Gallery browsing
- WhatsApp sharing

## 12.4 Minimal Guest Friction
Guests are never asked to create an account, set a password, or install an app.

Invitation link → RSVP.
QR scan → Gallery.

## 12.5 Indian Context
The app should feel designed for Indian weddings: Mehendi, Haldi, Sangeet, Roka, multiple events, family organisers, bride/groom sides, WhatsApp sharing, INR formatting (₹12,45,000), large guest counts.

## 12.6 Translation-Ready
The V1 UI is English only. All user-facing text is stored in translation files from day one, so Hindi, Punjabi, or other languages can be added without touching screens. Guest-facing pages are the first translation priority.

## 12.7 Performance on Low-End Phones
Guest pages (invitation, RSVP, gallery, upload, website) must load and work smoothly on a budget Android phone over a 4G connection. This is a requirement, not a nice-to-have.

---

# 13. Privacy and Security Expectations

Detailed security architecture belongs in system design. The product requires:

### Authenticated Data
Wedding management data is only accessible by that wedding's members.

### Cross-Wedding Isolation
A user in one wedding must never access another wedding's data. Every data access is scoped to the member's wedding, even though users belong to one wedding in V1.

### Guest Invitation Links
Tokens are cryptographically random, difficult to guess, and regenerable.

### Website and Gallery
Website and gallery pages are unlisted, send `noindex`, and use unguessable URLs. The full gallery is never linked from the website.

### Photo Upload
Guest uploads are validated server-side (type, size, count) and rate-limited per device.

### Third-Party Keys
The Google Places API key and email provider credentials are server-side only.

### Guest Personal Data
Shaadioo stores names, phone numbers, and emails of guests who never signed up. Collect only the listed fields, never share them with third parties, and permanently delete them when the wedding is deleted.

### Account Deletion
Members can delete their own account at any time (9.25 Account). Together with Delete wedding, this means a family can remove everything it has stored in Shaadioo.

---

# 14. Error and Edge Cases

### Wedding Member
- Invited email already has an account with no wedding → joins directly.
- Invited email already belongs to another wedding → invitation cannot be accepted; clear message shown.
- User accidentally created an empty wedding before accepting an invitation → can delete it, then accept.
- Invitation expires (after 7 days) → Admin resends.
- Admin removes a Manager → Manager loses access immediately; assigned tasks become unassigned.
- Admin attempts to remove or demote the final Admin → blocked.
- Last Admin tries to delete their account while other members remain → blocked; they must promote someone or delete the wedding first.
- Only member deletes their account → the wedding is deleted too.

### Guests
- Guest opens invalid or regenerated link → friendly "invitation not found" page.
- Guest submits RSVP twice → latest response wins.
- Guest changes their RSVP → allowed until the deadline.
- Guest tries to RSVP after the deadline → read-only response with contact message.
- Guest tries to RSVP for more people than allowed → blocked in UI and on server.
- Guest has no email → invitation shared through WhatsApp.
- CSV import contains duplicate phone numbers or unknown event names → flagged in preview.

### Events
- Event occurs after the primary wedding date → allowed.
- Event has no venue → allowed; venue shown as "To be announced".
- Event deleted after guests were invited → warning showing how many guests are affected, naming any guests invited only to that event. The event is removed from their invitations. Guests left with no events keep their RSVP answer, are excluded from dashboard counts, and see "There are no events on your invitation right now" on their link.

### Vendors
- Vendor exists without an expense → valid.
- Expense exists without a vendor → valid.
- Google quota exceeded or API unavailable → discovery shows an error; saved vendors show family-owned fields.
- Google place no longer exists → saved vendor shows "Details unavailable".

### Gallery
- Unsupported file or video → rejected with message.
- File over 15 MB → rejected with message.
- Upload fails midway → failed photos can be retried individually.
- Wedding reaches 2,000 photos → uploads blocked with message.
- Device reaches daily limit → uploads blocked for that device until the next day.
- Guest scans QR after wedding → gallery works unless members turned viewing or uploads off.
- Inappropriate photo uploaded → any member deletes it; deletion is logged.

### Livestream
- Invalid YouTube URL → validation error.
- Embedding disabled → "Watch on YouTube" button.

### Collaboration
- Two members edit the same record → last saved change wins.

---

# 15. Success Metrics

Shaadioo V1 is a portfolio project piloted with real weddings. Success is measured by real usage in pilots and by engineering quality.

## Pilot Metrics (per pilot wedding)

- **RSVP via link:** percentage of invited guests who RSVP through their link. **Target: ≥ 60%.**
- **Headcount source:** the family uses Shaadioo's attending count for catering (yes/no).
- **Collaboration:** number of active Wedding Members (target: 3+).
- **Guest list setup:** time taken to get the guest list into Shaadioo (import + cleanup).
- **Gallery:** number of photos uploaded by guests.
- **Qualitative:** what the family used, ignored, and asked for.

## Engineering Quality (portfolio)

- Guest pages meet a good mobile performance score on a throttled mid-range mobile profile.
- Automated tests cover authorization (cross-wedding isolation, role checks) and RSVP rules.
- Zero cross-wedding data leaks in security review.

## Pilots

| Pilot | Timing | Scope used |
|---|---|---|
| Pilot 1 | December 2026 wedding | Guest loop, website, gallery, QR, livestream |
| Pilot 2+ | 2027 weddings | Full V1 |

---

# 16. Release Strategy

Implementation is incremental, ordered by what a real wedding needs first. Security, responsive design, and tests are done inside every milestone, not saved for the end.

Target dates assume a mid-December pilot wedding; adjust once the date is fixed. There is no pressure to hit them exactly, but each milestone should have a date.

## Milestone 1: Guest Loop
**Target: 15 November 2026** (in time to send December invitations)

- Authentication, including signup via invitation
- Wedding creation and deletion of empty weddings
- Wedding Members and roles
- Activity log (infrastructure)
- Events
- Guest management, side tag, CSV import
- Event-level invitations and invitation links
- Invitation page and RSVP (with deadline)
- Email invitations, reminders, WhatsApp share
- Wedding website with **one theme**, publish toggle, unlisted slug
- Dashboard shell

## Milestone 2: Wedding Day
**Target: 7 December 2026**

- Gallery and albums
- Guest photo upload with limits
- Featured photos and website glimpse
- QR code
- YouTube livestream

## Milestone 3: Planning and Money
**Target: 31 January 2027**

- Tasks
- Expense tracker with "Paid by"
- My Vendors with cost check
- Vendor discovery (Google Places)
- Full dashboard cards

## Milestone 4: V1 Complete
**Target: 31 March 2027**

- Remaining two website themes
- Settings completion and Danger Zone, including Delete my account
- Security review
- Performance pass on guest pages
- Analytics for pilot metrics
- Deployment, monitoring, and backups
- Fixes from Pilot 1 feedback

---

# 17. Future Product Opportunities

Deliberately excluded from V1.

### V1.1 Candidates
- Per-event RSVP in the guest UI (requires migrating V1 guest-level RSVP data)
- Hindi and Punjabi translations for guest pages
- Features requested during pilots

### Communication
- WhatsApp API
- SMS reminders
- Automated RSVP reminders

### Advanced Guest Management
- Individual people inside an invitation
- Meal preferences
- Seating arrangements
- Accommodation and room allocation
- Transportation and pickups
- Shagun / gift register

### Financial Management
- Wedding budgets
- Vendor advances and payment schedules
- Structured expense splitting between families
- Side-based expense visibility

### Vendors
- Vendor profiles and reviews
- Vendor onboarding and accounts
- Marketplace, booking, and payments

### Wedding Website
- Custom domains
- More themes
- Custom page sections
- Advanced website builder

### Photos
- Video uploads
- Storage plans (paid)
- Original-resolution downloads
- Face recognition and "Find my photos"
- AI photo tagging
- Automatic event classification

### Accounts
- Multiple weddings per user
- Phone-number login with OTP
- Wedding planner accounts

### AI Wedding Assistant
A future AI layer that understands the wedding workspace:

- "What should I focus on this week?"
- "Which important wedding tasks are delayed?"
- "Create a checklist for my Haldi ceremony."
- "I have 300 guests. Suggest things I may have forgotten."
- "Summarize my upcoming payments and vendors."

AI should enhance the actual product data rather than add a generic chatbot.

---

# 18. V1 Product Definition

Shaadioo V1 is functionally complete when:

> A bride or groom can create a wedding, invite family members to collaboratively manage it, create wedding events, manage tasks, maintain and import guests, send invitations by email or WhatsApp, collect RSVPs, track expenses including who paid, manage vendors and discover them through Google Places, publish an unlisted themed wedding website, embed a YouTube livestream, and privately collect and share wedding photos through links and QR codes, while guests participate without creating accounts, and Admins can trace changes through the activity log.

---

# 19. Product Principle

Whenever deciding whether something belongs in V1, ask:

> **Does this feature directly help a family plan, coordinate, celebrate, or preserve their wedding?**

If yes, consider it.

If it introduces significant complexity without meaningfully improving the core wedding-management experience, defer it.

The objective of V1 is not to build every possible wedding-related feature. The objective is to build a cohesive product that a real Indian family can genuinely use for their wedding.
