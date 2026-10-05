import type { EventResponse } from '@/modules/events/schemas';

/** What the guest screens show of an event: enough for a checklist row or an invitation line. */
export type EventOption = {
  id: string;
  name: string;
  date: string;
  startTime?: string;
  endTime?: string;
  venue?: string;
};

export function toEventOption(event: EventResponse): EventOption {
  return {
    id: event.id,
    name: event.name,
    date: event.date,
    ...(event.startTime ? { startTime: event.startTime } : {}),
    ...(event.endTime ? { endTime: event.endTime } : {}),
    ...(event.venue?.name ? { venue: event.venue.name } : {}),
  };
}
