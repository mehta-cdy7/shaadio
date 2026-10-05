import { Badge } from '@/components/ui/badge';
import type { RsvpStatus } from '@/modules/guests/schemas';

const TONE = { ATTENDING: 'success', PENDING: 'neutral', NOT_ATTENDING: 'danger' } as const;

/** RSVP status pill. The caller passes the translated label. */
export function RsvpBadge({
  status,
  label,
  size = 'sm',
}: {
  status: RsvpStatus;
  label: string;
  size?: 'sm' | 'md';
}) {
  return (
    <Badge tone={TONE[status]} size={size}>
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {label}
    </Badge>
  );
}
