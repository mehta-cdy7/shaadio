import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Token-bearing guest pages (API_DESIGN §8.1): never stored by shared phones or proxies, never
  // indexed, and the URL is never sent on through Referer.
  async headers() {
    const guestPage = [
      { key: 'Cache-Control', value: 'no-store' },
      { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
      { key: 'Referrer-Policy', value: 'no-referrer' },
    ];
    return [{ source: '/invite/:token', headers: guestPage }];
  },
};

export default withNextIntl(nextConfig);
