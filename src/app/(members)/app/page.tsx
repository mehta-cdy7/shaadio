import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { currentMember } from '@/app/_lib/current-member';
import { hourIn, todayIn } from '@/lib/dates';
import { getDashboard } from '@/modules/dashboard';
import { CountdownHero } from './_components/countdown-hero';
import { GetStarted } from './_components/get-started';
import { SummaryCards } from './_components/summary-cards';
import { UpcomingEvents } from './_components/upcoming-events';
import { UpcomingTasks } from './_components/upcoming-tasks';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('members.dashboard');
  return { title: t('metaTitle'), robots: { index: false, follow: false } };
}

function greetingKey(hour: number) {
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

/** Wedding dashboard (PRD §9.3), from the same service as `GET /api/dashboard` (API-08). */
export default async function DashboardPage() {
  const current = await currentMember();
  // The layout has already redirected; this narrows the type.
  if (!current?.member) redirect('/onboarding');
  const { session, member } = current;
  const { wedding } = member;

  const t = await getTranslations('members.dashboard');
  const data = await getDashboard({ weddingId: member.weddingId, wedding });
  const firstName = session.user.name.split(' ')[0] ?? '';
  const isNew = data.events.count === 0 && data.guests.invitations === 0;

  return (
    <div className="flex flex-col gap-6 lg:gap-8">
      <header>
        <h1 className="font-display text-headline-lg-sm text-ink md:text-headline-lg">
          {t('title')}
        </h1>
        <p className="mt-1 text-body-lg text-ink-muted">
          {t(`greeting.${greetingKey(hourIn(wedding.timezone))}`, { name: firstName })}
        </p>
      </header>

      <CountdownHero daysToGo={data.daysToGo} wedding={wedding} />
      {isNew && <GetStarted />}
      <SummaryCards data={data} />

      <div className="grid gap-6 lg:grid-cols-2">
        <UpcomingEvents events={data.events.upcoming} />
        <UpcomingTasks tasks={data.tasks.upcoming} today={todayIn(wedding.timezone)} />
      </div>
    </div>
  );
}
