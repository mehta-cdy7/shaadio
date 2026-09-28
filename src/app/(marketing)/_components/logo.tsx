import Link from 'next/link';

/** Wordmark: "Shaadioo" in the display face with a secondary-colour dot. */
export function Logo() {
  return (
    <Link
      href="/"
      className="flex items-center font-display text-headline-sm font-semibold text-ink"
    >
      Shaadioo
      <span aria-hidden="true" className="ml-1 size-1.5 rounded-full bg-secondary" />
    </Link>
  );
}
