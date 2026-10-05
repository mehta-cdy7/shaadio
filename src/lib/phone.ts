/**
 * Phone numbers (DATABASE_DESIGN §1.7, API_DESIGN §1.2): stored and returned in E.164
 * (`+919876543210`). Input may be any common Indian format; a number without a country code is
 * assumed to be Indian. Pure, so the form and the server normalise the same way.
 */

const SEPARATORS = /[\s\-().]/g;

/**
 * The number in E.164, or undefined when it is not a phone number. Accepts `98112 34567`,
 * `098112-34567`, `+91 98112 34567`, `0091 98112 34567` and international `+44 20 7946 0958`.
 */
export function normalizePhone(input: string): string | undefined {
  let value = input.trim().replace(SEPARATORS, '');
  if (value.startsWith('00')) value = `+${value.slice(2)}`;

  if (value.startsWith('+')) {
    const digits = value.slice(1);
    if (!/^\d+$/.test(digits)) return undefined;
    if (digits.startsWith('91')) return indian(digits.slice(2));
    // E.164: a country code (no leading 0) and at most 15 digits in all.
    return /^[1-9]\d{7,14}$/.test(digits) ? `+${digits}` : undefined;
  }

  if (!/^\d+$/.test(value)) return undefined;
  if (value.length === 11 && value.startsWith('0')) return indian(value.slice(1));
  if (value.length === 12 && value.startsWith('91')) return indian(value.slice(2));
  return indian(value);
}

/** An Indian national number: 10 digits, not starting with 0. */
function indian(national: string): string | undefined {
  return /^[1-9]\d{9}$/.test(national) ? `+91${national}` : undefined;
}

/** For display: `+91 98112 34567` for Indian numbers, other numbers as stored. */
export function formatPhone(e164: string): string {
  const match = /^\+91(\d{5})(\d{5})$/.exec(e164);
  return match ? `+91 ${match[1]} ${match[2]}` : e164;
}
