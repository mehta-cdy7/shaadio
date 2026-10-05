'use client';

import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { describedBy, Field, inputClasses, textareaClasses } from '@/components/ui/field';
import { ArrowLeftIcon, CheckIcon, MinusIcon, PlusIcon } from '@/components/ui/icons';
import { useApiErrorMessage } from '@/components/ui/use-api-error';
import { useFieldErrors } from '@/components/ui/use-field-errors';
import { useUnsavedChangesWarning } from '@/components/ui/use-unsaved-changes';
import { patchJson, postJson } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatCalendarDate, formatTimeRange } from '@/lib/dates';
import {
  createGuestSchema,
  EMAIL_MAX,
  GUEST_NAME_MAX,
  GUESTS_PER_WEDDING,
  MAX_PEOPLE_MAX,
  MAX_PEOPLE_MIN,
  NOTES_MAX,
  SIDES,
  updateGuestSchema,
  type GuestDetailResponse,
  type GuestResponse,
  type Side,
} from '@/modules/guests/schemas';
import type { EventOption } from './event-option';
import {
  createGuestBody,
  EMPTY_GUEST_FORM,
  guestFormValues,
  sameGuestValues,
  updateGuestBody,
  type GuestFormValues,
} from './guest-form-values';
import { GuestPreview } from './guest-preview';
import { useRsvpLabel } from './rsvp-label';

type FieldName = 'name' | 'phone' | 'email' | 'maxPeople' | 'invitedEventIds' | 'notes';
type FieldErrors = Partial<Record<FieldName, string>>;

const FIELDS = new Set<string>(['name', 'phone', 'email', 'maxPeople', 'invitedEventIds', 'notes']);

const MAX_FOR: Partial<Record<FieldName, number>> = {
  name: GUEST_NAME_MAX,
  email: EMAIL_MAX,
  notes: NOTES_MAX,
};

/**
 * Add or edit a guest (PRD §9.7–9.8, API_DESIGN §14), with a preview of how their invitation will
 * list the chosen events. Editing the events never changes the RSVP, so the edit form shows the
 * current answer beside the event picker (DATABASE_DESIGN §14.1).
 */
export function GuestForm({
  guest,
  events,
  couple,
  atLimit = false,
}: {
  guest?: GuestResponse;
  /** The wedding's events, in date order. */
  events: EventOption[];
  couple: string;
  /** The wedding already has the most guests allowed: explain, and don't let the form save. */
  atLimit?: boolean;
}) {
  const t = useTranslations('members.guests.form');
  const tg = useTranslations('members.guests');
  const rsvpLabel = useRsvpLabel();
  const errorMessage = useApiErrorMessage();
  const router = useRouter();
  const [saved] = useState<GuestFormValues>(() =>
    guest ? guestFormValues(guest) : EMPTY_GUEST_FORM,
  );
  const [values, setValues] = useState(saved);
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string>();
  const formRef = useRef<HTMLFormElement>(null);
  const { fieldErrors, setFieldErrors, clearEdited } = useFieldErrors<FieldErrors>(formRef);

  const dirty = !sameGuestValues(values, saved);
  useUnsavedChangesWarning(dirty && !pending, t('unsavedWarning'));

  const backHref = guest ? `/app/guests/${guest.id}` : '/app/guests';
  const chosen = events.filter((event) => values.invitedEventIds.includes(event.id));

  function set<K extends keyof GuestFormValues>(key: K, value: GuestFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function setMaxPeople(next: number) {
    set('maxPeople', Math.min(MAX_PEOPLE_MAX, Math.max(MAX_PEOPLE_MIN, next)));
    // The stepper buttons don't fire `input`, so clear the error here.
    if (fieldErrors.maxPeople) setFieldErrors({ ...fieldErrors, maxPeople: undefined });
  }

  function toggleEvent(id: string) {
    set(
      'invitedEventIds',
      values.invitedEventIds.includes(id)
        ? values.invitedEventIds.filter((existing) => existing !== id)
        : [...values.invitedEventIds, id],
    );
  }

  function setAllEvents(all: boolean) {
    set('invitedEventIds', all ? events.map((event) => event.id) : []);
    if (all && fieldErrors.invitedEventIds) {
      setFieldErrors({ ...fieldErrors, invitedEventIds: undefined });
    }
  }

  function messageFor(field: FieldName, code: string): string {
    if (code === 'too_big' && MAX_FOR[field]) return t('tooLong', { max: MAX_FOR[field] });
    if (field === 'name') return t('nameRequired');
    if (field === 'phone') return t('phoneInvalid');
    if (field === 'email') return t('emailInvalid');
    if (field === 'maxPeople') {
      return t('maxPeopleRange', { min: MAX_PEOPLE_MIN, max: MAX_PEOPLE_MAX });
    }
    if (field === 'invitedEventIds') return t('eventGone');
    return t('tooLong', { max: MAX_FOR[field] ?? 0 });
  }

  async function onSubmit(submitEvent: FormEvent<HTMLFormElement>) {
    submitEvent.preventDefault();
    setFormError(undefined);
    const body = guest ? updateGuestBody(saved, values) : createGuestBody(values);
    const parsed = (guest ? updateGuestSchema : createGuestSchema).safeParse(body);
    const errors: FieldErrors = {};
    for (const issue of parsed.error?.issues ?? []) {
      const field = String(issue.path[0] ?? '');
      if (FIELDS.has(field) && !errors[field as FieldName]) {
        errors[field as FieldName] = messageFor(field as FieldName, issue.code);
      }
    }
    // A new guest, or one whose events were all removed, needs an event when the wedding has any.
    const emptied = !guest || saved.invitedEventIds.length > 0;
    if (events.length && !values.invitedEventIds.length && emptied) {
      errors.invitedEventIds = t('eventsRequired');
    }
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    setPending(true);
    const result = guest
      ? await patchJson<GuestResponse>(`/api/guests/${guest.id}`, body)
      : await postJson<GuestDetailResponse>('/api/guests', body);
    if (result.ok) {
      // Stays pending while the guest's page loads, so the button can't be pressed twice.
      router.push(`/app/guests/${result.data.id}`);
      router.refresh();
      return;
    }
    setPending(false);
    const details = result.details as
      { fields?: Record<string, unknown>; field?: string; attendingCount?: number } | undefined;
    if (result.code === 'VALIDATION_ERROR' && details?.fields) {
      const serverErrors: FieldErrors = {};
      for (const field of Object.keys(details.fields)) {
        if (FIELDS.has(field))
          serverErrors[field as FieldName] = messageFor(field as FieldName, '');
      }
      if (Object.keys(serverErrors).length) {
        setFieldErrors(serverErrors);
        return;
      }
    }
    if (result.code === 'BELOW_CONFIRMED') {
      setFieldErrors({ maxPeople: t('belowConfirmed', { count: details?.attendingCount ?? 0 }) });
    } else if (result.code === 'NOT_FOUND' && details?.field === 'invitedEventIds') {
      setFormError(t('eventGone'));
    } else if (result.code === 'NOT_FOUND') {
      setFormError(t('notFound'));
    } else if (result.code === 'LIMIT_REACHED') {
      setFormError(tg('limitReached', { max: GUESTS_PER_WEDDING }));
    } else {
      setFormError(errorMessage(result));
    }
  }

  const required = (
    <span className="text-danger">
      <span aria-hidden="true"> *</span>
      <span className="sr-only">({t('required')})</span>
    </span>
  );
  const optional = <span className="text-label text-ink-muted">{t('optional')}</span>;
  const label = (text: string, isRequired = false): ReactNode => (
    <>
      {text}
      {isRequired && required}
    </>
  );
  const control = (name: 'name' | 'phone' | 'email' | 'notes', hint?: string) => {
    const error = fieldErrors[name];
    return {
      id: name,
      name,
      value: values[name],
      onChange: (change: { target: { value: string } }) => set(name, change.target.value),
      'aria-invalid': error ? true : undefined,
      'aria-describedby': describedBy(name, { error, hint }),
    };
  };

  const phoneIsInternational = values.phone.trim().startsWith('+');
  const maxPeopleHint = t('maxPeopleHint', { min: MAX_PEOPLE_MIN, max: MAX_PEOPLE_MAX });
  const allChosen = events.length > 0 && chosen.length === events.length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-body text-ink-muted hover:text-ink"
        >
          <ArrowLeftIcon width={16} height={16} />
          {guest ? guest.name : t('back')}
        </Link>
        <h1 className="mt-2 font-display text-headline-lg-sm text-ink md:text-headline-lg">
          {guest ? t('editTitle') : t('addTitle')}
        </h1>
        <p className="mt-1 text-body-lg text-ink-muted">{t('lead')}</p>
      </div>

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <Card>
          {atLimit && <Alert className="mb-6">{t('atLimit', { max: GUESTS_PER_WEDDING })}</Alert>}
          {formError && <Alert className="mb-6">{formError}</Alert>}
          <form
            ref={formRef}
            noValidate
            onSubmit={onSubmit}
            onInput={clearEdited}
            className="flex flex-col gap-6"
          >
            <Field id="name" label={label(t('name'), true)} error={fieldErrors.name}>
              <input
                {...control('name')}
                type="text"
                required
                maxLength={GUEST_NAME_MAX}
                autoComplete="off"
                placeholder={t('namePlaceholder')}
                className={inputClasses}
              />
            </Field>

            <fieldset className="flex flex-col gap-2" aria-describedby="side-hint">
              <div className="mb-1.5 flex items-center justify-between gap-3">
                <legend className="text-body font-medium text-ink">{t('side')}</legend>
                {values.side ? (
                  <button
                    type="button"
                    onClick={() => set('side', '')}
                    className="text-label font-medium text-ink-accent hover:underline"
                  >
                    {t('clearSide')}
                  </button>
                ) : (
                  optional
                )}
              </div>
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                {SIDES.map((side: Side) => (
                  <label
                    key={side}
                    className="flex cursor-pointer items-center justify-center gap-2 rounded-control border border-line bg-surface px-3 py-3 text-body text-ink transition-colors has-checked:border-primary has-checked:bg-primary-subtle has-focus-visible:outline-2 has-focus-visible:outline-focus sm:text-body-lg"
                  >
                    <input
                      type="radio"
                      name="side"
                      value={side}
                      checked={values.side === side}
                      onChange={() => set('side', side)}
                      className="size-4 accent-primary"
                    />
                    {tg(`sides.${side}`)}
                  </label>
                ))}
              </div>
              <p id="side-hint" className="text-label text-ink-muted">
                {t('sideHint')}
              </p>
            </fieldset>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field
                id="phone"
                label={t('phone')}
                action={optional}
                hint={t('phoneHint')}
                error={fieldErrors.phone}
              >
                <div className="flex">
                  {!phoneIsInternational && (
                    <span
                      aria-hidden="true"
                      className="flex items-center rounded-l-control border border-r-0 border-line bg-fill px-3 text-body-lg text-ink-muted"
                    >
                      +91
                    </span>
                  )}
                  <input
                    {...control('phone', t('phoneHint'))}
                    type="tel"
                    inputMode="tel"
                    autoComplete="off"
                    maxLength={30}
                    placeholder="98112 34567"
                    className={cn(inputClasses, !phoneIsInternational && 'rounded-l-none')}
                  />
                </div>
              </Field>
              <Field id="email" label={t('email')} action={optional} error={fieldErrors.email}>
                <input
                  {...control('email')}
                  type="email"
                  inputMode="email"
                  autoComplete="off"
                  maxLength={EMAIL_MAX}
                  placeholder={t('emailPlaceholder')}
                  className={inputClasses}
                />
              </Field>
            </div>

            <Field
              id="maxPeople"
              label={label(t('maxPeople'), true)}
              hint={maxPeopleHint}
              error={fieldErrors.maxPeople}
            >
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  aria-label={t('decrease')}
                  onClick={() => setMaxPeople(values.maxPeople - 1)}
                  disabled={values.maxPeople <= MAX_PEOPLE_MIN}
                  className="size-12 px-0 md:size-12 md:px-0"
                >
                  <MinusIcon width={18} height={18} />
                </Button>
                <div className="w-20">
                  <input
                    id="maxPeople"
                    name="maxPeople"
                    type="number"
                    inputMode="numeric"
                    min={MAX_PEOPLE_MIN}
                    max={MAX_PEOPLE_MAX}
                    value={values.maxPeople}
                    onChange={(change) => set('maxPeople', Number(change.target.value))}
                    onBlur={() => setMaxPeople(values.maxPeople || MAX_PEOPLE_MIN)}
                    aria-invalid={fieldErrors.maxPeople ? true : undefined}
                    aria-describedby={describedBy('maxPeople', {
                      error: fieldErrors.maxPeople,
                      hint: maxPeopleHint,
                    })}
                    className={cn(inputClasses, 'text-center')}
                  />
                </div>
                <Button
                  variant="outline"
                  aria-label={t('increase')}
                  onClick={() => setMaxPeople(values.maxPeople + 1)}
                  disabled={values.maxPeople >= MAX_PEOPLE_MAX}
                  className="size-12 px-0 md:size-12 md:px-0"
                >
                  <PlusIcon width={18} height={18} />
                </Button>
              </div>
            </Field>

            <fieldset
              className="flex flex-col gap-2"
              aria-describedby={fieldErrors.invitedEventIds ? 'events-error' : 'events-hint'}
            >
              <div className="flex items-center justify-between gap-3">
                <legend className="text-body font-medium text-ink">
                  {label(t('invitedTo'), events.length > 0)}
                </legend>
                {events.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setAllEvents(!allChosen)}
                    className="text-label font-medium text-ink-accent hover:underline"
                  >
                    {allChosen ? t('selectNone') : t('selectAll')}
                  </button>
                )}
              </div>
              {fieldErrors.invitedEventIds ? (
                <p id="events-error" className="text-label font-medium text-danger">
                  {fieldErrors.invitedEventIds}
                </p>
              ) : (
                <p id="events-hint" className="text-label text-ink-muted">
                  {t('invitedToHint')}
                </p>
              )}
              {guest && (
                <p className="rounded-control bg-canvas-muted px-3.5 py-2.5 text-body text-ink-muted">
                  {t('currentRsvp', { answer: rsvpLabel(guest.rsvp) })}
                </p>
              )}
              {events.length === 0 ? (
                <div className="flex flex-col items-start gap-3 rounded-control border border-dashed border-line p-4 text-body text-ink-muted">
                  {t('noEventsYet')}
                  <ButtonLink href="/app/events/new" variant="outline">
                    {t('addEvent')}
                  </ButtonLink>
                </div>
              ) : (
                <ul className="mt-1 flex flex-col gap-2">
                  {events.map((event) => {
                    const checked = values.invitedEventIds.includes(event.id);
                    const time = formatTimeRange(event.startTime, event.endTime);
                    return (
                      <li key={event.id}>
                        <label
                          className={cn(
                            'flex cursor-pointer items-start gap-3 rounded-control border px-4 py-3 transition-colors has-focus-visible:outline-2 has-focus-visible:outline-focus',
                            checked ? 'border-primary bg-primary-subtle' : 'border-line bg-surface',
                          )}
                        >
                          <input
                            type="checkbox"
                            name="invitedEventIds"
                            value={event.id}
                            checked={checked}
                            onChange={() => toggleEvent(event.id)}
                            className="mt-1 size-4 shrink-0 accent-primary"
                          />
                          <span className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
                            <span className="min-w-0">
                              <span className="block font-display text-title text-ink">
                                {event.name}
                              </span>
                              {(time || event.venue) && (
                                <span className="block text-body text-ink-muted">
                                  {[time, event.venue].filter(Boolean).join(' · ')}
                                </span>
                              )}
                            </span>
                            <span className="shrink-0 text-label font-semibold tracking-wide text-secondary-ink uppercase">
                              {formatCalendarDate(event.date, 'dayMonth')}
                            </span>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </fieldset>

            <Field id="notes" label={t('notes')} action={optional} error={fieldErrors.notes}>
              <textarea
                {...control('notes')}
                rows={3}
                maxLength={NOTES_MAX}
                placeholder={t('notesPlaceholder')}
                className={textareaClasses}
              />
            </Field>

            <div className="mt-2 flex flex-col-reverse gap-3 border-t border-line pt-6 sm:flex-row sm:justify-end">
              <ButtonLink href={backHref} variant="outline">
                {t('cancel')}
              </ButtonLink>
              <Button type="submit" disabled={pending || atLimit || (Boolean(guest) && !dirty)}>
                <CheckIcon width={18} height={18} />
                {pending ? t('saving') : t('save')}
              </Button>
            </div>
          </form>
        </Card>

        <aside className="sticky top-8 hidden lg:block">
          <GuestPreview
            couple={couple}
            name={values.name}
            maxPeople={values.maxPeople}
            events={chosen}
          />
        </aside>
      </div>
    </div>
  );
}
