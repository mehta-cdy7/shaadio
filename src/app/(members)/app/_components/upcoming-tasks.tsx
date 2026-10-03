import { getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { ChecklistIcon, SquareIcon, UserIcon } from '@/components/ui/icons';
import { daysBetween } from '@/lib/dates';
import { cn } from '@/lib/cn';
import type { DashboardTask } from '@/modules/dashboard/schemas';
import { EmptyState, Panel } from './panel';

/** Incomplete tasks by due date, overdue first (PRD §9.3 "Upcoming Tasks", API_DESIGN §11). */
export async function UpcomingTasks({ tasks, today }: { tasks: DashboardTask[]; today: string }) {
  const t = await getTranslations('members.dashboard.upcomingTasks');

  if (tasks.length === 0) {
    return (
      <Panel title={t('title')}>
        <EmptyState
          icon={ChecklistIcon}
          title={t('emptyTitle')}
          body={t('emptyBody')}
          cta={{ href: '/app/tasks', label: t('emptyCta') }}
        />
      </Panel>
    );
  }

  function due(dueDate: string | undefined) {
    if (!dueDate) return { label: t('noDueDate'), tone: 'neutral' as const, overdue: false };
    const days = daysBetween(today, dueDate);
    if (days < 0)
      return { label: t('overdue', { days: -days }), tone: 'danger' as const, overdue: true };
    if (days === 0) return { label: t('dueToday'), tone: 'pending' as const, overdue: false };
    if (days === 1) return { label: t('dueTomorrow'), tone: 'pending' as const, overdue: false };
    return { label: t('dueIn', { days }), tone: 'neutral' as const, overdue: false };
  }

  return (
    <Panel title={t('title')} viewAll={{ href: '/app/tasks', label: t('viewAll') }}>
      <ul className="flex flex-col gap-3">
        {tasks.map((task) => {
          const status = due(task.dueDate);
          return (
            <li
              key={task.id}
              className={cn(
                'flex gap-3 rounded-control border bg-canvas-muted p-4',
                status.overdue ? 'border-danger/30' : 'border-transparent',
              )}
            >
              <SquareIcon
                width={20}
                height={20}
                className={cn('mt-0.5 shrink-0', status.overdue ? 'text-danger' : 'text-ink-muted')}
              />
              <div className="flex min-w-0 flex-col gap-2">
                <h3 className="text-body-lg text-ink">{task.title}</h3>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Badge tone={status.tone} size="sm">
                    {status.label}
                  </Badge>
                  <span className="flex items-center gap-1 text-body-sm text-ink-muted">
                    <UserIcon width={14} height={14} className="shrink-0" />
                    {task.assignee?.name ?? t('unassigned')}
                  </span>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
