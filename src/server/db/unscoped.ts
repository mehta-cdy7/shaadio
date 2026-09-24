import 'server-only';

/**
 * Unscoped data access: the ONLY module allowed to bypass the tenant guard (DATABASE_DESIGN §6.3,
 * DB-08). These lookups run before the wedding is known, because they are how the wedding is
 * found. They use the native driver (`connection.db.collection('<name>')`) by collection name, so
 * this infrastructure file never imports domain modules. ESLint forbids `.collection` everywhere else.
 *
 * Allowed lookups — this list IS the tenant-isolation audit, together with the tenant-guard test:
 *
 *   1. Resolve current wedding        wedding_memberships by userId       → continue scoped
 *   2. Accept member invitation       member_invitations by tokenHash     → scoped by its weddingId
 *   3. Public invitation page         guests by inviteLink.token          → check wedding ACTIVE
 *   4. Public website                 weddings by website.slug            → check published + ACTIVE
 *   5. Public gallery                 weddings by gallery.token           → check ACTIVE + switches
 *   6. Email worker claim             email_jobs by status/lease          → each job carries weddingId
 *   7. Upload cleanup                 photo_uploads by expiresAt          → each carries weddingId
 *   8. Deletion and retention jobs    tenant collections by weddingId of a DELETING/expired wedding
 *   9. Migrations                     run by an operator from migrations/, never by the app
 *
 * Adding a tenth lookup needs explicit approval and a matching entry in DATABASE_DESIGN §6.3.
 * Nothing is implemented yet: each lookup lands with the feature that needs it.
 */
export {};
