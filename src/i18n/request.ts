import { getRequestConfig } from 'next-intl/server';

/**
 * V1 is English-only with no locale in the URL (PRD §12.6). Every user-facing string still goes
 * through next-intl so that Hindi/Punjabi can be added by adding message files.
 */
export const DEFAULT_LOCALE = 'en';

export default getRequestConfig(async () => {
  const locale = DEFAULT_LOCALE;
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
