/** Faint jaali lattice behind the hero (Stitch): diamonds, ovals and dots in the plum ink. */
export function Lattice() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 text-ink-accent opacity-[0.04]"
    >
      <svg className="size-full">
        <defs>
          <pattern id="jaali" width={56} height={56} patternUnits="userSpaceOnUse">
            <path d="M28 4 52 28 28 52 4 28Z" fill="none" stroke="currentColor" />
            <path
              d="M28 12c8 0 12 8 12 16s-4 16-12 16-12-8-12-16 4-16 12-16Z"
              fill="none"
              stroke="currentColor"
              strokeWidth={0.75}
            />
            <circle cx={28} cy={28} r={2.5} fill="currentColor" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#jaali)" />
      </svg>
    </div>
  );
}
