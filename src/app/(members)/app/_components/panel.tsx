import type { ComponentType, ReactNode, SVGProps } from 'react';
import Link from 'next/link';
import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ArrowRightIcon } from '@/components/ui/icons';

/** A dashboard list card: title, a "view all" link, then the list or an empty state. */
export function Panel({
  title,
  viewAll,
  children,
}: {
  title: string;
  viewAll?: { href: string; label: string };
  children: ReactNode;
}) {
  return (
    <Card className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-display text-headline-md text-ink">{title}</h2>
        {viewAll && (
          <Link
            href={viewAll.href}
            className="flex shrink-0 items-center gap-1 text-body font-medium text-ink-accent hover:underline"
          >
            {viewAll.label}
            <ArrowRightIcon width={16} height={16} />
          </Link>
        )}
      </div>
      {children}
    </Card>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  body,
  cta,
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  title: string;
  body: string;
  cta: { href: string; label: string };
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-6 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-fill text-ink-accent">
        <Icon width={24} height={24} />
      </span>
      <h3 className="font-display text-headline-sm text-ink">{title}</h3>
      <p className="max-w-80 text-body text-pretty text-ink-muted">{body}</p>
      <ButtonLink href={cta.href} variant="outline" className="mt-2">
        {cta.label}
      </ButtonLink>
    </div>
  );
}
