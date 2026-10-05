'use client';

import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { describedBy, Field, inputClasses, textareaClasses } from '@/components/ui/field';
import { ArrowLeftIcon } from '@/components/ui/icons';
import { useApiErrorMessage } from '@/components/ui/use-api-error';
import { useFieldErrors } from '@/components/ui/use-field-errors';
import { useUnsavedChangesWarning } from '@/components/ui/use-unsaved-changes';
import { patchJson, postJson } from '@/lib/api';
import { formatCalendarDate } from '@/lib/dates';
import {
  createEventSchema,
  DATE_TOO_LATE,
  DRESS_CODE_MAX,
  END_WITHOUT_START,
  eventTimeProblem,
  EVENT_DESCRIPTION_MAX,
  EVENT_NAME_MAX,
  EVENT_TYPES,
  EVENTS_PER_WEDDING,
  latestEventDate,
  MAP_URL_MAX,
  updateEventSchema,
  VENUE_ADDRESS_MAX,
  VENUE_NAME_MAX,
  type EventResponse,
  type EventType,
} from '@/modules/events/schemas';
import { EventPreview } from './event-preview';
import {
  createEventBody,
  EMPTY_EVENT_FORM,
  eventFormValues,
  updateEventBody,
  type EventFormValues,
} from './event-form-values';

type TextField = Exclude<keyof EventFormValues, 'type'>;
type FieldErrors = Partial<Record<TextField, string>>;

/** Schema paths → form fields. */
const FIELD_FOR_PATH: Record<string, TextField> = {
  name: 'name',
  date: 'date',
  startTime: 'startTime',
  endTime: 'endTime',
  'venue.name': 'venueName',
  'venue.address': 'venueAddress',
  'venue.mapUrl': 'mapUrl',
  dressCode: 'dressCode',
  description: 'description',
};

const MAX_FOR: Partial<Record<TextField, number>> = {
  name: EVENT_NAME_MAX,
  venueName: VENUE_NAME_MAX,
  venueAddress: VENUE_ADDRESS_MAX,
  mapUrl: MAP_URL_MAX,
  dressCode: DRESS_CODE_MAX,
  description: EVENT_DESCRIPTION_MAX,
};

/**
 * Add or edit an event (PRD §9.5, API_DESIGN §13), with a live preview of how guests will see it.
 * Picking a type fills the name with that type until the user writes their own.
 */
export function EventForm({
  event,
  couple,
  weddingDate,
  atLimit = false,
}: {
  event?: EventResponse;
  couple: string;
  weddingDate: string;
  /** The wedding already has the most events allowed: explain, and don't let the form save. */
  atLimit?: boolean;
}) {
  const t = useTranslations('members.events.form');
  const tt = useTranslations('members.events.types');
  const te = useTranslations('members.events');
  const errorMessage = useApiErrorMessage();
  const router = useRouter();
  const [saved] = useState<EventFormValues>(() =>
    event ? eventFormValues(event) : EMPTY_EVENT_FORM,
  );
  const [values, setValues] = useState(saved);
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string>();
  const formRef = useRef<HTMLFormElement>(null);
  const { fieldErrors, setFieldErrors, clearEdited } = useFieldErrors<FieldErrors>(formRef);

  const dirty = (Object.keys(values) as Array<keyof EventFormValues>).some(
    (key) => values[key] !== saved[key],
  );
  useUnsavedChangesWarning(dirty && !pending, t('unsavedWarning'));

  function pickType(type: EventType) {
    setValues((prev) => {
      const autoName = !prev.name.trim() || prev.name === tt(prev.type);
      return {
        ...prev,
        type,
        name: autoName ? (type === 'CUSTOM' ? '' : tt(type)) : prev.name,
      };
    });
  }

  const latest = latestEventDate(weddingDate);

  function messageFor(field: TextField, code: string, reason?: string): string {
    if (code === 'too_big') return t('tooLong', { max: MAX_FOR[field] ?? 0 });
    if (reason === DATE_TOO_LATE) {
      return t('dateTooLate', { latest: formatCalendarDate(latest) });
    }
    if (reason === END_WITHOUT_START) return t('endNeedsStart');
    if (reason) return t('sameTimes');
    if (field === 'name') return t('nameRequired');
    if (field === 'date') return t('dateRequired');
    if (field === 'startTime' || field === 'endTime') return t('timeInvalid');
    if (field === 'mapUrl') return t('mapUrlInvalid');
    return t('tooLong', { max: MAX_FOR[field] ?? 0 });
  }

  async function onSubmit(submitEvent: FormEvent<HTMLFormElement>) {
    submitEvent.preventDefault();
    setFormError(undefined);
    const body = event ? updateEventBody(saved, values) : createEventBody(values);
    const parsed = (event ? updateEventSchema : createEventSchema).safeParse(body);
    const errors: FieldErrors = {};
    for (const issue of parsed.error?.issues ?? []) {
      const field = FIELD_FOR_PATH[issue.path.join('.')];
      const reason = (issue as { params?: { reason?: string } }).params?.reason;
      if (field && !errors[field]) errors[field] = messageFor(field, issue.code, reason);
    }
    // The same rules the server applies to the event as it will be stored (PRD §9.5).
    const timeProblem = eventTimeProblem(values.startTime, values.endTime);
    if (timeProblem && !errors.endTime) {
      errors.endTime = messageFor('endTime', 'custom', timeProblem);
    }
    const dateChanged = !event || values.date !== saved.date;
    if (dateChanged && values.date > latest && !errors.date) {
      errors.date = messageFor('date', 'custom', DATE_TOO_LATE);
    }
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    setPending(true);
    const result = event
      ? await patchJson<EventResponse>(`/api/events/${event.id}`, body)
      : await postJson<EventResponse>('/api/events', body);
    if (result.ok) {
      // Stays pending while the list loads, so the button can't be pressed twice.
      router.push('/app/events');
      router.refresh();
      return;
    }
    setPending(false);
    const serverFields = (result.details as { fields?: Record<string, unknown> } | undefined)
      ?.fields;
    if (result.code === 'VALIDATION_ERROR' && (serverFields?.date || serverFields?.endTime)) {
      setFieldErrors({
        ...(serverFields.date ? { date: messageFor('date', 'custom', DATE_TOO_LATE) } : {}),
        ...(serverFields.endTime
          ? { endTime: messageFor('endTime', 'custom', timeProblem ?? END_WITHOUT_START) }
          : {}),
      });
      return;
    }
    if (result.code === 'LIMIT_REACHED')
      setFormError(te('limitReached', { max: EVENTS_PER_WEDDING }));
    else if (result.code === 'NOT_FOUND') setFormError(t('notFound'));
    else setFormError(errorMessage(result));
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
  const control = (name: TextField, hint?: string) => {
    const error = fieldErrors[name];
    return {
      id: name,
      name,
      value: values[name],
      onChange: (change: { target: { value: string } }) =>
        setValues((prev) => ({
          ...prev,
          [name]: change.target.value,
          // No start, no end: clearing the start clears the end too (PRD §9.5).
          ...(name === 'startTime' && !change.target.value ? { endTime: '' } : {}),
        })),
      'aria-invalid': error ? true : undefined,
      'aria-describedby': describedBy(name, { error, hint }),
    };
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/app/events"
          className="inline-flex items-center gap-1.5 text-body text-ink-muted hover:text-ink"
        >
          <ArrowLeftIcon width={16} height={16} />
          {t('back')}
        </Link>
        <h1 className="mt-2 font-display text-headline-lg-sm text-ink md:text-headline-lg">
          {event ? t('editTitle') : t('addTitle')}
        </h1>
      </div>

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Card>
          {atLimit && <Alert className="mb-6">{t('atLimit', { max: EVENTS_PER_WEDDING })}</Alert>}
          {formError && <Alert className="mb-6">{formError}</Alert>}
          <form
            ref={formRef}
            noValidate
            onSubmit={onSubmit}
            onInput={clearEdited}
            className="flex flex-col gap-5"
          >
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1.5 text-body font-medium text-ink">{t('type')}</legend>
              <div className="flex flex-wrap gap-2">
                {EVENT_TYPES.map((type) => (
                  <label
                    key={type}
                    className="cursor-pointer rounded-full border border-line bg-surface px-3.5 py-1.5 text-body text-ink transition-colors hover:bg-fill has-checked:border-primary has-checked:bg-primary has-checked:text-on-primary has-focus-visible:outline-2 has-focus-visible:outline-focus"
                  >
                    <input
                      type="radio"
                      name="type"
                      value={type}
                      checked={values.type === type}
                      onChange={() => pickType(type)}
                      className="sr-only"
                    />
                    {tt(type)}
                  </label>
                ))}
              </div>
            </fieldset>

            <Field
              id="name"
              label={label(t('name'), true)}
              hint={t('nameHint')}
              error={fieldErrors.name}
            >
              <input
                {...control('name', t('nameHint'))}
                type="text"
                required
                maxLength={EVENT_NAME_MAX}
                autoComplete="off"
                className={inputClasses}
              />
            </Field>

            <div className="grid gap-5 sm:grid-cols-3">
              <Field id="date" label={label(t('date'), true)} error={fieldErrors.date}>
                <input
                  {...control('date')}
                  type="date"
                  required
                  max={latest}
                  className={inputClasses}
                />
              </Field>
              <Field
                id="startTime"
                label={t('startTime')}
                action={optional}
                error={fieldErrors.startTime}
              >
                <input {...control('startTime')} type="time" className={inputClasses} />
              </Field>
              <Field
                id="endTime"
                label={t('endTime')}
                action={optional}
                hint={t('endTimeHint')}
                error={fieldErrors.endTime}
              >
                <input
                  {...control('endTime', t('endTimeHint'))}
                  type="time"
                  disabled={!values.startTime}
                  className={inputClasses}
                />
              </Field>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field
                id="venueName"
                label={t('venueName')}
                action={optional}
                error={fieldErrors.venueName}
              >
                <input
                  {...control('venueName')}
                  type="text"
                  maxLength={VENUE_NAME_MAX}
                  placeholder={t('venueNamePlaceholder')}
                  className={inputClasses}
                />
              </Field>
              <Field
                id="venueAddress"
                label={t('address')}
                action={optional}
                error={fieldErrors.venueAddress}
              >
                <input
                  {...control('venueAddress')}
                  type="text"
                  maxLength={VENUE_ADDRESS_MAX}
                  autoComplete="street-address"
                  placeholder={t('addressPlaceholder')}
                  className={inputClasses}
                />
              </Field>
            </div>

            <Field id="mapUrl" label={t('mapUrl')} action={optional} error={fieldErrors.mapUrl}>
              <input
                {...control('mapUrl')}
                type="url"
                inputMode="url"
                maxLength={MAP_URL_MAX}
                placeholder={t('mapUrlPlaceholder')}
                className={inputClasses}
              />
            </Field>

            <Field
              id="dressCode"
              label={t('dressCode')}
              action={optional}
              error={fieldErrors.dressCode}
            >
              <input
                {...control('dressCode')}
                type="text"
                maxLength={DRESS_CODE_MAX}
                placeholder={t('dressCodePlaceholder')}
                className={inputClasses}
              />
            </Field>

            <Field
              id="description"
              label={t('description')}
              action={optional}
              error={fieldErrors.description}
            >
              <textarea
                {...control('description')}
                rows={4}
                maxLength={EVENT_DESCRIPTION_MAX}
                placeholder={t('descriptionPlaceholder')}
                className={textareaClasses}
              />
            </Field>

            <div className="mt-3 flex flex-col-reverse gap-3 border-t border-line pt-6 sm:flex-row sm:justify-end">
              <ButtonLink href="/app/events" variant="outline">
                {t('cancel')}
              </ButtonLink>
              <Button type="submit" disabled={pending || atLimit || (Boolean(event) && !dirty)}>
                {pending ? t('saving') : t('save')}
              </Button>
            </div>
          </form>
        </Card>

        <aside className="sticky top-8 hidden lg:block">
          <EventPreview values={values} couple={couple} />
        </aside>
      </div>
    </div>
  );
}
