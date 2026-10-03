import Link from 'next/link';

/**
 * Stitch logo: a jharokha arch mark (plum outer arch, brass inner arch and finial), the wordmark in
 * the display face and a brass dot. The footer uses the wordmark alone.
 */
export function Logo({ mark = true }: { mark?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      {mark && (
        <svg viewBox="10 10 28 32" width={22} height={25} fill="none" aria-hidden="true">
          <path
            d="M12 40V24a12 12 0 0 1 24 0v16"
            className="stroke-ink-accent"
            strokeWidth={2.5}
            strokeLinecap="round"
          />
          <path
            d="M18 40V26a6 6 0 0 1 12 0v14"
            className="stroke-secondary"
            strokeWidth={1.5}
            strokeLinecap="round"
          />
          <circle cx={24} cy={14} r={2} className="fill-secondary" />
        </svg>
      )}
      <span className="flex items-end gap-0.5 font-display text-headline-sm font-semibold tracking-tight text-ink">
        Shaadioo
        <span aria-hidden="true" className="mb-1.5 size-1.5 rounded-full bg-secondary" />
      </span>
    </Link>
  );
}
