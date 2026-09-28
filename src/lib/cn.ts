/** Joins class names, skipping falsy values. Small on purpose: no class-merging library. */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}
