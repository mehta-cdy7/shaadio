import 'server-only';

/**
 * Headers for public token endpoints (API_DESIGN §8.1): never indexed, and the token-bearing URL is
 * never sent on through Referer.
 */
export function publicHeaders(res: Response): Response {
  res.headers.set('X-Robots-Tag', 'noindex, nofollow');
  res.headers.set('Referrer-Policy', 'no-referrer');
  return res;
}
