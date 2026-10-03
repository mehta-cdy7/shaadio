import 'server-only';
import { randomInt } from 'node:crypto';

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const PART_MAX = 30;

/** "Princí Sharma" → "princi-sharma". Scripts without a Latin form are dropped. */
function normalize(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, PART_MAX)
    .replace(/-+$/, '');
}

/**
 * Website slug (SYSTEM_DESIGN §27): both names in display order plus a 6-character random suffix,
 * so the address cannot be guessed from an invitation card. Never derived from the date.
 */
export function newWebsiteSlug(first: string, second: string): string {
  const suffix = Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
  const names = [normalize(first), normalize(second)].filter(Boolean);
  return [...(names.length ? names : ['wedding']), suffix].join('-');
}
