'use client';

import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { describedBy, Field, inputClasses, textareaClasses } from '@/components/ui/field';
import { Eyebrow } from '@/components/ui/typography';
import { useApiErrorMessage } from '@/components/ui/use-api-error';
import { useFieldErrors } from '@/components/ui/use-field-errors';
import { getJson, postJson } from '@/lib/api';
import { coupleNames } from '@/lib/couple';
import { todayIn } from '@/lib/dates';
import {
  CITY_MAX,
  COUPLE_NAME_MAX,
  DEFAULT_TIMEZONE,
  STATE_MAX,
  createWeddingSchema,
  DESCRIPTION_MAX,
  TITLE_MAX,
  VENUE_MAX,
  NAME_ORDERS,
  PAST_DATE,
  type NameOrder,
  type WeddingResponse,
} from '@/modules/weddings/schemas';
import type { MeResponse } from '@/modules/auth/schemas';
import { WeddingPreview, type PreviewValues } from './wedding-preview';

type FieldName =
  'brideName' | 'groomName' | 'weddingDate' | 'city' | 'state' | 'venue' | 'title' | 'description';
type FieldErrors = Partial<Record<FieldName, string>>;

/** Schema paths → form fields. Venue, city and state all feed `location`. */
const FIELD_FOR_PATH: Record<string, FieldName> = {
  brideName: 'brideName',
  groomName: 'groomName',
  weddingDate: 'weddingDate',
  'location.city': 'city',
  'location.state': 'state',
  'location.formattedAddress': 'venue',
  title: 'title',
  description: 'description',
};

/**
 * "Create your wedding" (PRD §9.2, API_DESIGN §11 `POST /api/wedding`): the form on the left and a
 * live preview of the couple's card on the right; on phones the preview sits above the form.
 * `header` and `footer` are rendered by the server page.
 */
export function CreateWedding({ header, footer }: { header: ReactNode; footer: ReactNode }) {
  const t = useTranslations('members.onboarding');
  const errorMessage = useApiErrorMessage();
  const router = useRouter();
  const [values, setValues] = useState<PreviewValues>({
    brideName: '',
    groomName: '',
    nameOrder: 'BRIDE_FIRST',
    weddingDate: '',
    city: '',
    state: '',
  });
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string>();
  const formRef = useRef<HTMLFormElement>(null);
  const { fieldErrors, setFieldErrors, clearEdited } = useFieldErrors<FieldErrors>(formRef);

  const required = (
    <span className="text-danger">
      <span aria-hidden="true"> *</span>
      <span className="sr-only">({t('required')})</span>
    </span>
  );
  const optional = <span className="text-label text-ink-muted">{t('optional')}</span>;

  function messageFor(field: FieldName, tooBig: boolean, pastDate = false): string {
    const max = {
      brideName: COUPLE_NAME_MAX,
      groomName: COUPLE_NAME_MAX,
      weddingDate: 0,
      city: CITY_MAX,
      state: STATE_MAX,
      venue: VENUE_MAX,
      title: TITLE_MAX,
      description: DESCRIPTION_MAX,
    }[field];
    if (tooBig) return t('tooLong', { max });
    if (field === 'brideName') return t('brideRequired');
    if (field === 'groomName') return t('groomRequired');
    if (field === 'weddingDate') return pastDate ? t('dateInPast') : t('dateRequired');
    return t('cityRequired');
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const text = (name: string) => String(data.get(name) ?? '').trim();
    const city = text('city');
    const state = text('state');
    const venue = text('venue');

    const parsed = createWeddingSchema.safeParse({
      brideName: text('brideName'),
      groomName: text('groomName'),
      nameOrder: text('nameOrder'),
      weddingDate: text('weddingDate'),
      // The venue line, when given, leads the address; the city is always part of it.
      location: {
        city,
        state,
        formattedAddress: [venue, city, state].filter(Boolean).join(', '),
      },
      title: text('title'),
      description: text('description'),
    });

    setFormError(undefined);
    if (!parsed.success) {
      const errors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = FIELD_FOR_PATH[issue.path.join('.')];
        // An empty city also fails formattedAddress; the city message covers both.
        if (!field || errors[field] || (field === 'venue' && !city)) continue;
        const pastDate =
          issue.code === 'custom' &&
          (issue.params as { reason?: string } | undefined)?.reason === PAST_DATE;
        errors[field] = messageFor(field, issue.code === 'too_big', pastDate);
      }
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    setPending(true);
    const result = await postJson<WeddingResponse>('/api/wedding', parsed.data);
    // ALREADY_MEMBER usually means the wedding was created in another tab: go to it. But a
    // membership can outlive its wedding (one being deleted, DATABASE_DESIGN §14.8), and /app would
    // send the user straight back here, so only go when /api/me confirms an active wedding.
    const hasWedding =
      result.ok ||
      (result.code === 'ALREADY_MEMBER' &&
        (await getJson<MeResponse>('/api/me').then((me) => me.ok && Boolean(me.data.wedding))));
    if (hasWedding) {
      // Stays pending while the workspace loads, so the button can't be pressed twice.
      router.replace('/app');
      router.refresh();
      return;
    }
    setPending(false);
    // The client check passed, so a server date error means the two clocks disagree about today.
    const serverFields = (result.details as { fields?: Record<string, unknown> } | undefined)
      ?.fields;
    if (result.code === 'VALIDATION_ERROR' && serverFields?.weddingDate) {
      setFieldErrors({ weddingDate: t('dateInPast') });
      return;
    }
    setFormError(errorMessage(result));
  }

  function onChange(event: FormEvent<HTMLFormElement>) {
    const target = event.target as HTMLInputElement;
    if (target.name in values) setValues((prev) => ({ ...prev, [target.name]: target.value }));
  }

  const names = {
    brideName: values.brideName.trim() || t('preview.bride'),
    groomName: values.groomName.trim() || t('preview.groom'),
  };
  const [first, second] = coupleNames({ ...names, nameOrder: values.nameOrder });

  const preview = (
    <section aria-label={t('preview.label')} className="flex w-full flex-col items-center gap-5">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-label-sm font-semibold tracking-widest text-secondary-ink uppercase">
        <span aria-hidden="true" className="size-1.5 rounded-full bg-secondary" />
        {t('preview.label')}
      </span>
      <WeddingPreview values={values} />
      <p className="text-center text-body text-ink-muted italic">{t('preview.caption')}</p>
    </section>
  );

  const field = (name: FieldName, error = fieldErrors[name], hint?: string) => ({
    id: name,
    name,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy(name, { error, hint }),
  });

  return (
    <div className="grid min-h-dvh bg-canvas lg:grid-cols-2">
      <div className="flex flex-col px-4 py-8 sm:px-14 lg:px-20 lg:py-12">
        {header}
        <main className="mx-auto w-full max-w-130 py-10">
          <div className="flex flex-col gap-3">
            <Eyebrow>
              {t('step')} <span aria-hidden="true">·</span> {t('stepLabel')}
            </Eyebrow>
            <h1 className="font-display text-headline-lg-sm font-normal text-balance text-ink md:text-headline-lg">
              {t('title')}
            </h1>
            <p className="text-body-lg text-ink-muted">{t('lead')}</p>
          </div>

          <div className="mt-8 lg:hidden">{preview}</div>

          {formError && <Alert className="mt-8">{formError}</Alert>}

          <form
            ref={formRef}
            noValidate
            onSubmit={onSubmit}
            onInput={clearEdited}
            onChange={onChange}
            className="mt-8 flex flex-col gap-5"
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <Field
                id="brideName"
                label={
                  <>
                    {t('brideName')}
                    {required}
                  </>
                }
                error={fieldErrors.brideName}
              >
                <input
                  {...field('brideName')}
                  type="text"
                  required
                  maxLength={COUPLE_NAME_MAX}
                  autoComplete="off"
                  className={inputClasses}
                />
              </Field>
              <Field
                id="groomName"
                label={
                  <>
                    {t('groomName')}
                    {required}
                  </>
                }
                error={fieldErrors.groomName}
              >
                <input
                  {...field('groomName')}
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
                {NAME_ORDERS.map((order: NameOrder) => {
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
                        defaultChecked={order === 'BRIDE_FIRST'}
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
              label={
                <>
                  {t('weddingDate')}
                  {required}
                </>
              }
              hint={t('weddingDateHint')}
              error={fieldErrors.weddingDate}
            >
              <input
                {...field('weddingDate', fieldErrors.weddingDate, t('weddingDateHint'))}
                type="date"
                required
                // The picker greys out past days; the schema check is still the real guard.
                min={todayIn(DEFAULT_TIMEZONE)}
                className={inputClasses}
              />
            </Field>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field
                id="city"
                label={
                  <>
                    {t('city')}
                    {required}
                  </>
                }
                error={fieldErrors.city}
              >
                <input
                  {...field('city')}
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
                  {...field('state')}
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
                {...field('venue')}
                type="text"
                maxLength={VENUE_MAX}
                autoComplete="street-address"
                placeholder={t('venuePlaceholder')}
                className={inputClasses}
              />
            </Field>

            <Field id="title" label={t('weddingTitle')} action={optional} error={fieldErrors.title}>
              <input
                {...field('title')}
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
                {...field('description')}
                rows={4}
                maxLength={DESCRIPTION_MAX}
                placeholder={t('descriptionPlaceholder')}
                className={textareaClasses}
              />
            </Field>

            <Button type="submit" size="lg" disabled={pending} className="mt-3 w-full">
              {pending ? t('submitting') : t('submit')}
            </Button>
          </form>

          <p className="mt-6 rounded-control bg-fill px-4 py-3 text-center text-body text-ink-muted">
            {t('invited')} <span className="text-ink">{t('invitedBody')}</span>
          </p>
        </main>
        {footer}
      </div>
      <aside className="hidden border-l border-secondary bg-panel lg:block">
        <div className="sticky top-0 flex h-dvh items-center justify-center p-16">
          <div className="w-full max-w-110">{preview}</div>
        </div>
      </aside>
    </div>
  );
}
