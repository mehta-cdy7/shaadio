import type {
  CreateEventInput,
  EventResponse,
  EventType,
  UpdateEventInput,
} from '@/modules/events/schemas';

/** The add/edit event form as strings; blanks mean "not given". */
export type EventFormValues = {
  type: EventType;
  name: string;
  date: string;
  startTime: string;
  endTime: string;
  venueName: string;
  venueAddress: string;
  mapUrl: string;
  dressCode: string;
  description: string;
};

export const EMPTY_EVENT_FORM: EventFormValues = {
  type: 'CUSTOM',
  name: '',
  date: '',
  startTime: '',
  endTime: '',
  venueName: '',
  venueAddress: '',
  mapUrl: '',
  dressCode: '',
  description: '',
};

export function eventFormValues(event: EventResponse): EventFormValues {
  return {
    type: event.type,
    name: event.name,
    date: event.date,
    startTime: event.startTime ?? '',
    endTime: event.endTime ?? '',
    venueName: event.venue?.name ?? '',
    venueAddress: event.venue?.address ?? '',
    mapUrl: event.venue?.mapUrl ?? '',
    dressCode: event.dressCode ?? '',
    description: event.description ?? '',
  };
}

/** `POST /api/events` body. */
export function createEventBody(values: EventFormValues): CreateEventInput {
  const venue = { name: values.venueName, address: values.venueAddress, mapUrl: values.mapUrl };
  return {
    name: values.name,
    type: values.type,
    date: values.date,
    ...(values.startTime ? { startTime: values.startTime } : {}),
    ...(values.endTime ? { endTime: values.endTime } : {}),
    ...(Object.values(venue).some((part) => part.trim()) ? { venue } : {}),
    description: values.description,
    dressCode: values.dressCode,
  };
}

/**
 * `PATCH /api/events/:id` body with only what changed (omitted = unchanged); emptied optional
 * fields go as `null`. The venue is sent whole when any part of it changed.
 */
export function updateEventBody(saved: EventFormValues, values: EventFormValues): UpdateEventInput {
  const changed = (key: keyof EventFormValues) => saved[key].trim() !== values[key].trim();
  const orNull = (value: string) => value.trim() || null;
  const body: UpdateEventInput = {};
  if (changed('name')) body.name = values.name;
  if (changed('type')) body.type = values.type;
  if (changed('date')) body.date = values.date;
  if (changed('startTime')) body.startTime = orNull(values.startTime);
  if (changed('endTime')) body.endTime = orNull(values.endTime);
  if (changed('venueName') || changed('venueAddress') || changed('mapUrl')) {
    const venue = { name: values.venueName, address: values.venueAddress, mapUrl: values.mapUrl };
    body.venue = Object.values(venue).some((part) => part.trim()) ? venue : null;
  }
  if (changed('dressCode')) body.dressCode = orNull(values.dressCode);
  if (changed('description')) body.description = orNull(values.description);
  return body;
}
