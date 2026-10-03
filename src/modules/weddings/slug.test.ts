import { describe, expect, it } from 'vitest';
import { newWebsiteSlug } from './slug';

describe('newWebsiteSlug', () => {
  it('joins the normalised names and a random 6-character suffix', () => {
    expect(newWebsiteSlug('Princí', 'Akshay Kumar')).toMatch(/^princi-akshay-kumar-[a-z0-9]{6}$/);
  });

  it('falls back when no name has a Latin form', () => {
    expect(newWebsiteSlug('प्रिंसी', 'अक्षय')).toMatch(/^wedding-[a-z0-9]{6}$/);
  });

  it('does not repeat suffixes', () => {
    const slugs = new Set(Array.from({ length: 50 }, () => newWebsiteSlug('a', 'b')));
    expect(slugs.size).toBe(50);
  });
});
