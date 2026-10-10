import { previewMemberInvitation } from '@/modules/members';
import { AppError } from '@/server/http/errors';
import { publicHeaders } from '@/server/http/public';
import { handler } from '@/server/http/route';

/**
 * GET /api/public/member-invitations/:token (API_DESIGN §26): who invited whom, before sign-in.
 * Revoked, accepted and unknown tokens are the same 404.
 */
export function GET(
  req: Request,
  { params }: RouteContext<'/api/public/member-invitations/[token]'>,
) {
  return handler('/api/public/member-invitations/[token]', async () => {
    const preview = await previewMemberInvitation((await params).token);
    if (!preview) throw new AppError('NOT_FOUND', 'This invitation is not available.');
    return publicHeaders(Response.json(preview));
  })(req);
}
