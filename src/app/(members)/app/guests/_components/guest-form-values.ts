import { formatPhone } from '@/lib/phone';
import type {
  CreateGuestInput,
  GuestResponse,
  Side,
  UpdateGuestInput,
} from '@/modules/guests/schemas';

/** The add/edit guest form. Text is kept as typed; blanks mean "not given". */
export type GuestFormValues = {
  name: string;
  side: Side | '';
  phone: string;
  email: string;
  maxPeople: number;
  invitedEventIds: string[];
  notes: string;
};

export const EMPTY_GUEST_FORM: GuestFormValues = {
  name: '',
  side: '',
  phone: '',
  email: '',
  maxPeople: 1,
  invitedEventIds: [],
  notes: '',
};

export function guestFormValues(guest: GuestResponse): GuestFormValues {
  return {
    name: guest.name,
    side: guest.side ?? '',
    phone: guest.phone ? formatPhone(guest.phone) : '',
    email: guest.email ?? '',
    maxPeople: guest.maxPeople,
    invitedEventIds: guest.invitedEventIds,
    notes: guest.notes ?? '',
  };
}

function sameIds(a: string[], b: string[]): boolean {
  return a.length === b.length && [...a].sort().join() === [...b].sort().join();
}

export function sameGuestValues(a: GuestFormValues, b: GuestFormValues): boolean {
  return (
    a.name === b.name &&
    a.side === b.side &&
    a.phone === b.phone &&
    a.email === b.email &&
    a.maxPeople === b.maxPeople &&
    a.notes === b.notes &&
    sameIds(a.invitedEventIds, b.invitedEventIds)
  );
}

/** `POST /api/guests`: blanks are left out. */
export function createGuestBody(values: GuestFormValues): CreateGuestInput {
  return {
    name: values.name,
    maxPeople: values.maxPeople,
    invitedEventIds: values.invitedEventIds,
    ...(values.side ? { side: values.side } : {}),
    ...(values.phone.trim() ? { phone: values.phone } : {}),
    ...(values.email.trim() ? { email: values.email } : {}),
    ...(values.notes.trim() ? { notes: values.notes } : {}),
  };
}

/**
 * `PATCH /api/guests/:id`: only what changed. An emptied optional field is sent as `null`, which
 * clears it (API-04).
 */
export function updateGuestBody(saved: GuestFormValues, values: GuestFormValues): UpdateGuestInput {
  const body: UpdateGuestInput = {};
  if (values.name !== saved.name) body.name = values.name;
  if (values.maxPeople !== saved.maxPeople) body.maxPeople = values.maxPeople;
  if (!sameIds(values.invitedEventIds, saved.invitedEventIds)) {
    body.invitedEventIds = values.invitedEventIds;
  }
  if (values.side !== saved.side) body.side = values.side || null;
  for (const key of ['phone', 'email', 'notes'] as const) {
    if (values[key] !== saved[key]) body[key] = values[key].trim() ? values[key] : null;
  }
  return body;
}
