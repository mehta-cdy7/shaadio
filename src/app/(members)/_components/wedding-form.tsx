'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { describedBy, Field, inputClasses, textareaClasses } from '@/components/ui/field';
import { coupleNames } from '@/lib/couple';
import { todayIn } from '@/lib/dates';
import {
  CITY_MAX,
  COUPLE_NAME_MAX,
  DEFAULT_TIMEZONE,
  DESCRIPTION_MAX,
  isPastWeddingDate,
  joinAddress,
  NAME_ORDERS,
  splitVenue,
  STATE_MAX,
  TITLE_MAX,
  VENUE_MAX,
  weddingFieldsSchema,
  type NameOrder,
  type WeddingResponse,
} from '@/modules/weddings/schemas';
import { WeddingPreview } from './wedding-preview';

/**
 * The wedding details form, shared by "Create your wedding" (/onboarding) and Settings → Wedding
 * details (PRD §9.2, §9.25). Controlled: the page owns the values, so it can show the live
 * preview, track unsaved changes and reset them.
 */

export type WeddingFormValues = {
  brideName: string;
  groomName: string;
  nameOrder: NameOrder;
  weddingDate: string;
  city: string;
  state: string;
  venue: string;
  title: string;
  description: string;
};

export type WeddingFieldName = Exclude<keyof WeddingFormValues, 'nameOrder'>;
export type WeddingFieldErrors = Partial<Record<WeddingFieldName, string>>;

export const EMPTY_WEDDING_FORM: WeddingFormValues = {
  brideName: '',
  groomName: '',
  nameOrder: 'BRIDE_FIRST',
  weddingDate: '',
  city: '',
  state: '',
  venue: '',
  title: '',
  description: '',
};

export function weddingFormValues(wedding: WeddingResponse): WeddingFormValues {
  return {
    brideName: wedding.brideName,
    groomName: wedding.groomName,
    nameOrder: wedding.nameOrder,
    weddingDate: wedding.weddingDate,
    city: wedding.location.city,
    state: wedding.location.state ?? '',
    venue: splitVenue(wedding.location),
    title: wedding.title ?? '',
    description: wedding.description ?? '',
  };
}

/** Schema paths → form fields. Venue, city and state all feed `location`. */
const FIELD_FOR_PATH: Record<string, WeddingFieldName> = {
  brideName: 'brideName',
  groomName: 'groomName',
  weddingDate: 'weddingDate',
  'location.city': 'city',
  'location.state': 'state',
  'location.formattedAddress': 'venue',
  title: 'title',
  description: 'description',
};

const MAX_FOR: Record<WeddingFieldName, number> = {
  brideName: COUPLE_NAME_MAX,
  groomName: COUPLE_NAME_MAX,
  weddingDate: 0,
  city: CITY_MAX,
  state: STATE_MAX,
  venue: VENUE_MAX,
  title: TITLE_MAX,
  description: DESCRIPTION_MAX,
};

type Checked =
  | { ok: true; data: ReturnType<typeof weddingFieldsSchema.parse> }
  | { ok: false; errors: WeddingFieldErrors };

/**
 * Client-side check with the same rules the server uses, mapped to translated field messages.
 * `savedDate` is the stored date when editing: resending an unchanged date that has since passed
 * is allowed (API_DESIGN §11), so the "today or later" rule only applies to a new date.
 */
export function useCheckWeddingForm() {
  const t = useTranslations('members.weddingForm');

  function messageFor(field: WeddingFieldName, tooBig: boolean): string {
    if (tooBig) return t('tooLong', { max: MAX_FOR[field] });
    if (field === 'brideName') return t('brideRequired');
    if (field === 'groomName') return t('groomRequired');
    if (field === 'weddingDate') return t('dateRequired');
    return t('cityRequired');
  }

  return (values: WeddingFormValues, savedDate?: string): Checked => {
    const city = values.city.trim();
    const state = values.state.trim();
    const parsed = weddingFieldsSchema.safeParse({
      brideName: values.brideName,
      groomName: values.groomName,
      nameOrder: values.nameOrder,
      weddingDate: values.weddingDate,
      location: { city, state, formattedAddress: joinAddress(values.venue.trim(), city, state) },
      title: values.title,
      description: values.description,
    });

    const errors: WeddingFieldErrors = {};
    for (const issue of parsed.error?.issues ?? []) {
      const field = FIELD_FOR_PATH[issue.path.join('.')];
      // An empty city also fails formattedAddress; the city message covers both.
      if (!field || errors[field] || (field === 'venue' && !city)) continue;
      errors[field] = messageFor(field, issue.code === 'too_big');
    }
    if (
      !errors.weddingDate &&
      values.weddingDate !== savedDate &&
      isPastWeddingDate(values.weddingDate)
    ) {
      errors.weddingDate = t('dateInPast');
    }

    return parsed.success && Object.keys(errors).length === 0
      ? { ok: true, data: parsed.data }
      : { ok: false, errors };
  };
}

/** The couple's card with its "Live preview" label and caption. */
export function WeddingPreviewPanel({ values }: { values: WeddingFormValues }) {
  const t = useTranslations('members.weddingForm.preview');
  return (
    <section aria-label={t('label')} className="flex w-full flex-col items-center gap-5">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-label-sm font-semibold tracking-widest text-secondary-ink uppercase">
        <span aria-hidden="true" className="size-1.5 rounded-full bg-secondary" />
        {t('label')}
      </span>
      <WeddingPreview values={values} />
      <p className="text-center text-body text-ink-muted italic">{t('caption')}</p>
    </section>
  );
}

/** The form fields. Inputs are named after their error keys, so `useFieldErrors` can clear them. */
export function WeddingFields({
  values,
  onChange,
  fieldErrors,
}: {
  values: WeddingFormValues;
  onChange: (values: WeddingFormValues) => void;
  fieldErrors: WeddingFieldErrors;
}) {
  const t = useTranslations('members.weddingForm');

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

  const names = {
    brideName: values.brideName.trim() || t('preview.bride'),
    groomName: values.groomName.trim() || t('preview.groom'),
  };
  const [first, second] = coupleNames({ ...names, nameOrder: values.nameOrder });

  const control = (name: WeddingFieldName, hint?: string) => {
    const error = fieldErrors[name];
    return {
      id: name,
      name,
      value: values[name],
      onChange: (event: { target: { value: string } }) =>
        onChange({ ...values, [name]: event.target.value }),
      'aria-invalid': error ? true : undefined,
      'aria-describedby': describedBy(name, { error, hint }),
    };
  };

  return (
    <>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="brideName" label={label(t('brideName'), true)} error={fieldErrors.brideName}>
          <input
            {...control('brideName')}
            type="text"
            required
            maxLength={COUPLE_NAME_MAX}
            autoComplete="off"
            className={inputClasses}
          />
        </Field>
        <Field id="groomName" label={label(t('groomName'), true)} error={fieldErrors.groomName}>
          <input
            {...control('groomName')}
            type="text"
            required
            maxLength={COUPLE_NAME_MAX}
            autoComplete="off"
            className={inputClasses}
          />
        </Field>
      </div>

      <fieldset className="flex flex-col gap-2" aria-describedby="nameOrder-hint">
        <legend className="mb-1.5 text-body font-medium text-ink">{t('nameOrder')}</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {NAME_ORDERS.map((order) => {
            const [a, b] = coupleNames({ ...names, nameOrder: order });
            return (
              <label
                key={order}
                className="flex cursor-pointer items-center gap-3 rounded-control border border-line bg-surface px-3.5 py-3 text-body-lg text-ink transition-colors has-checked:border-primary has-checked:bg-primary-subtle has-focus-visible:outline-2 has-focus-visible:outline-focus"
              >
                <input
                  type="radio"
                  name="nameOrder"
                  value={order}
                  checked={values.nameOrder === order}
                  onChange={() => onChange({ ...values, nameOrder: order })}
                  className="size-4 accent-primary"
                />
                <span className="truncate">
                  {a} &amp; {b}
                </span>
              </label>
            );
          })}
        </div>
        <p id="nameOrder-hint" className="text-label text-ink-muted">
          {t('nameOrderHint')}
        </p>
      </fieldset>

      <Field
        id="weddingDate"
        label={label(t('weddingDate'), true)}
        hint={t('weddingDateHint')}
        error={fieldErrors.weddingDate}
      >
        <input
          {...control('weddingDate', t('weddingDateHint'))}
          type="date"
          required
          // The picker greys out past days; the schema check is still the real guard.
          min={todayIn(DEFAULT_TIMEZONE)}
          className={inputClasses}
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="city" label={label(t('city'), true)} error={fieldErrors.city}>
          <input
            {...control('city')}
            type="text"
            required
            maxLength={CITY_MAX}
            autoComplete="address-level2"
            placeholder={t('cityPlaceholder')}
            className={inputClasses}
          />
        </Field>
        <Field id="state" label={t('state')} action={optional} error={fieldErrors.state}>
          <input
            {...control('state')}
            type="text"
            maxLength={STATE_MAX}
            autoComplete="address-level1"
            placeholder={t('statePlaceholder')}
            className={inputClasses}
          />
        </Field>
      </div>

      <Field id="venue" label={t('venue')} action={optional} error={fieldErrors.venue}>
        <input
          {...control('venue')}
          type="text"
          maxLength={VENUE_MAX}
          autoComplete="street-address"
          placeholder={t('venuePlaceholder')}
          className={inputClasses}
        />
      </Field>

      <Field id="title" label={t('weddingTitle')} action={optional} error={fieldErrors.title}>
        <input
          {...control('title')}
          type="text"
          maxLength={TITLE_MAX}
          autoComplete="off"
          placeholder={t('weddingTitlePlaceholder', { bride: first, groom: second })}
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
          maxLength={DESCRIPTION_MAX}
          placeholder={t('descriptionPlaceholder')}
          className={textareaClasses}
        />
      </Field>
    </>
  );
}
