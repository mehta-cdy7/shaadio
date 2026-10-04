import { describe, expect, it } from 'vitest';
import { weddingFieldsSchema } from '@/modules/weddings/schemas';
import type { WeddingFormValues } from '../../../_components/wedding-form';
import { weddingChanges } from './wedding-changes';

const saved: WeddingFormValues = {
  brideName: 'Princi',
  groomName: 'Akshay',
  nameOrder: 'BRIDE_FIRST',
  weddingDate: '2027-02-14',
  city: 'Dehradun',
  state: 'Uttarakhand',
  venue: 'Forest Resort',
  title: 'Shaadi',
  description: '',
};

function changes(edit: Partial<WeddingFormValues>) {
  const values = { ...saved, ...edit };
  const parsed = weddingFieldsSchema.parse({
    brideName: values.brideName,
    groomName: values.groomName,
    nameOrder: values.nameOrder,
    weddingDate: values.weddingDate,
    location: {
      city: values.city,
      state: values.state,
      formattedAddress: [values.venue, values.city, values.state].filter(Boolean).join(', '),
    },
    title: values.title,
    description: values.description,
  });
  return weddingChanges(saved, values, parsed);
}

describe('weddingChanges', () => {
  it('sends only the edited field, never an untouched location', () => {
    expect(changes({ description: 'Welcome!' })).toEqual({ description: 'Welcome!' });
    expect(changes({ nameOrder: 'GROOM_FIRST' })).toEqual({ nameOrder: 'GROOM_FIRST' });
  });

  it('sends the whole location when venue, city or state changes', () => {
    expect(changes({ venue: 'Lake Palace' })).toEqual({
      location: {
        city: 'Dehradun',
        state: 'Uttarakhand',
        formattedAddress: 'Lake Palace, Dehradun, Uttarakhand',
      },
    });
    expect(changes({ state: '' }).location).toEqual({
      city: 'Dehradun',
      formattedAddress: 'Forest Resort, Dehradun',
    });
  });

  it('clears emptied text with null and ignores whitespace-only edits', () => {
    expect(changes({ title: '' })).toEqual({ title: null });
    expect(changes({ brideName: 'Princi ' })).toEqual({});
  });
});
