import type messages from '../../messages/en.json';

// Type-checks every t('…') key against messages/en.json at build time.
declare module 'next-intl' {
  interface AppConfig {
    Locale: 'en';
    Messages: typeof messages;
  }
}
