import { Eyebrow, Heading, Lead } from '@/components/ui/typography';
import { cn } from '@/lib/cn';

/** Centred eyebrow, heading and optional lead that open most landing sections. */
export function SectionIntro({
  eyebrow,
  title,
  body,
  className,
}: {
  eyebrow: string;
  title: string;
  body?: string;
  className?: string;
}) {
  return (
    <div className={cn('mx-auto flex flex-col items-center gap-3 text-center', className)}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <Heading>{title}</Heading>
      {body && <Lead>{body}</Lead>}
    </div>
  );
}
