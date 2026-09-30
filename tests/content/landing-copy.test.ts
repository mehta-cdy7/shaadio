import { describe, expect, it } from 'vitest';
import messages from '../../messages/en.json';

/**
 * The landing page may only promise what V1 ships (PRD §6, §7). The Stitch mock-ups keep suggesting
 * non-goals (hotel rooms, budgets, real-time sync…); these checks catch them if they are copied
 * back in. They run over every string under `landing`, including the mock-ups' sample data.
 */
const OUT_OF_SCOPE = [
  { topic: 'accommodation (PRD §7)', pattern: /hotel|room (block|list)|rooms reserved/i },
  { topic: 'travel logistics (PRD §7)', pattern: /airport|\bcabs?\b|car transfer|flight/i },
  { topic: 'budgets and limits (PRD §7, §9.15)', pattern: /budget|remaining|\btarget\b/i },
  { topic: 'real-time collaboration (PRD Rule 8)', pattern: /real[- ]?time|live sync|instant/i },
  {
    topic: 'payment splitting and schedules (PRD §7)',
    pattern: /settle|split ledger|instal?ment|\badvance\b|deposit|RTGS/i,
  },
  {
    topic: 'catering and seating (not in the PRD)',
    pattern: /dietar|per[- ]plate|seating|\btable \d/i,
  },
  {
    topic: 'original photos and video (PRD §7, §9.22)',
    pattern: /zero compression|original resolution|high[- ]definition|\bHD\b|archival|\bvideos?\b/i,
  },
  { topic: 'paid plans and guest caps (PRD §7)', pattern: /\b500\b|paid plan|premium|upgrade/i },
  { topic: 'side-based permissions (PRD Rule 6)', pattern: /side workspace|role boundar/i },
  { topic: 'time zones (not in the PRD)', pattern: /time ?zone/i },
];

function strings(value: unknown, path: string): Array<[path: string, text: string]> {
  if (typeof value === 'string') return [[path, value]];
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, child]) => strings(child, `${path}.${key}`));
  }
  return [];
}

describe('landing copy stays within V1 scope', () => {
  const copy = strings(messages.landing, 'landing');

  it('has copy to check', () => {
    expect(copy.length).toBeGreaterThan(100);
  });

  it.each(OUT_OF_SCOPE)('does not promise $topic', ({ pattern }) => {
    const hits = copy.filter(([, text]) => pattern.test(text)).map(([path]) => path);
    expect(hits).toEqual([]);
  });
});
