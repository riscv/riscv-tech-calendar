import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { classify, cleanTitle, dedupKey, kindsOf } from '../classify.js';
import {
  addDaysToKey,
  dayKeyIn,
  formatTimeIn,
  localDayStart,
  minutesSinceMidnightIn,
  daysUntilYearEnd,
  daysUntilMonthEnd,
  isoWeekNumber,
  startOfWeekKey,
  weekKeys,
  windowForKeys,
  zoneAbbrev,
} from '../datetime.js';
import { matchesQuery } from '../search.js';
import { findMatchInOccurrences } from '../occurrenceSearch.js';
import { parseCalendar } from '../ics.js';
import { expand } from '../occurrences.js';
import { fetchFeed } from '../feed.js';
import { calendarConfig } from '../../config/calendarConfig.js';

const FIXTURE = readFileSync(
  fileURLToPath(new URL('./fixtures/lfx-sample.ics', import.meta.url)),
  'utf8',
);

const events = parseCalendar(FIXTURE);
const originalFetch = globalThis.fetch;

/** Every window is a fixed instant, so these assertions never drift with the clock. */
const at = (iso) => new Date(iso);

function installSessionStorage() {
  const store = new Map();
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key),
    },
  });
  return store;
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  if (originalFetch) globalThis.fetch = originalFetch;
  else delete globalThis.fetch;
  delete globalThis.sessionStorage;
});

describe('classify', () => {
  it('strips LFX bookkeeping from titles', () => {
    expect(cleanTitle('RV Automotive SIG (New)')).toBe('RV Automotive SIG');
    expect(cleanTitle('RV SoftCPU SIG (20260805)')).toBe('RV SoftCPU SIG');
    expect(cleanTitle('RISC-V Dev Boards Meeting - East-friendly (LFX)')).toBe(
      'RISC-V Dev Boards Meeting - East-friendly',
    );
  });

  it('collapses old/new entries for the same group onto one key', () => {
    expect(dedupKey('RV Floating Point SIG (New)')).toBe(
      dedupKey('RV-LFX Floating Point SIG'),
    );
  });

  it('does not collapse genuinely different groups', () => {
    expect(dedupKey('RV Vector SIG (New)')).not.toBe(dedupKey('RV Vector DSP TG (new)'));
  });

  it('reports every kind a joint meeting belongs to', () => {
    expect(kindsOf('RV Joint Crypto SIG/TGs (New)').sort()).toEqual(['SIG', 'TG']);
  });

  it('falls back to Other rather than returning nothing', () => {
    expect(kindsOf('RV Golden Model (New)')).toEqual(['Other']);
    expect(classify('RV Priv SW HC (New)').kinds).toContain('HC');
  });

  it('classifies every non TG/SIG/HC/CSC meeting as Other only', () => {
    expect(kindsOf('RISC-V Summit North America')).toEqual(['Other']);
    expect(kindsOf('Sample')).toEqual(['Other']);
    expect(kindsOf('Openprofile.dev Working Session')).toEqual(['Other']);
  });
});

describe('datetime', () => {
  it('derives the calendar day in the target zone, not the host zone', () => {
    // 01:00 UTC on the 5th is still the 4th in Los Angeles.
    const instant = at('2026-08-05T01:00:00Z');
    expect(dayKeyIn(instant, 'America/Los_Angeles')).toBe('2026-08-04');
    expect(dayKeyIn(instant, 'UTC')).toBe('2026-08-05');
    expect(dayKeyIn(instant, 'Asia/Tokyo')).toBe('2026-08-05');
  });

  it('keeps day arithmetic correct across a DST transition', () => {
    // US clocks go back on 2026-11-01; the key sequence must not repeat or skip.
    expect(addDaysToKey('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDaysToKey('2026-11-01', 1)).toBe('2026-11-02');
    expect(addDaysToKey('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysToKey('2028-02-28', 1)).toBe('2028-02-29'); // leap year
  });

  it('starts weeks on Monday', () => {
    expect(startOfWeekKey('2026-08-07')).toBe('2026-08-03'); // a Friday
    expect(startOfWeekKey('2026-08-03')).toBe('2026-08-03'); // already Monday
    expect(startOfWeekKey('2026-08-09')).toBe('2026-08-03'); // Sunday belongs to it
    expect(weekKeys('2026-08-03')).toHaveLength(7);
    expect(weekKeys('2026-08-03').at(-1)).toBe('2026-08-09');
  });

  it('pads the expansion window past both day boundaries', () => {
    const { start, end } = windowForKeys(weekKeys('2026-08-03'));
    expect(start.getTime()).toBeLessThan(at('2026-08-03T00:00:00Z').getTime());
    expect(end.getTime()).toBeGreaterThan(at('2026-08-10T00:00:00Z').getTime());
  });

  it('finds the real UTC instant for a local day boundary', () => {
    const start = localDayStart('2026-08-03', 'Pacific/Kiritimati');
    expect(start.toISOString()).toBe('2026-08-02T10:00:00.000Z');
    expect(dayKeyIn(new Date(start.getTime() - 1), 'Pacific/Kiritimati')).toBe(
      '2026-08-02',
    );
    expect(dayKeyIn(start, 'Pacific/Kiritimati')).toBe('2026-08-03');
  });

  it('labels a zone differently either side of DST', () => {
    // The abbreviation is a property of the instant, not just the zone — a
    // meeting shown as PST in January is PDT in July.
    expect(zoneAbbrev(at('2026-01-15T18:00:00Z'), 'America/Los_Angeles')).toBe('PST');
    expect(zoneAbbrev(at('2026-07-15T18:00:00Z'), 'America/Los_Angeles')).toBe('PDT');
    expect(zoneAbbrev(at('2026-07-15T18:00:00Z'), 'UTC')).toBe('UTC');
  });

  it('reports wall-clock minutes in the target zone', () => {
    const instant = at('2026-08-04T18:00:00Z');
    expect(minutesSinceMidnightIn(instant, 'UTC')).toBe(18 * 60);
    expect(formatTimeIn(instant, 'America/Los_Angeles')).toBe('11:00');
    expect(formatTimeIn(instant, 'Asia/Tokyo')).toBe('03:00');
    expect(formatTimeIn(instant, 'America/Los_Angeles', '12h')).toBe('11:00 AM');
    expect(formatTimeIn(instant, 'Asia/Tokyo', '12h')).toBe('3:00 AM');
  });
});

describe('search', () => {
  it('matches short acronym terms as whole words', () => {
    // Reported bugs: 'AME' matched both 'RV Par-ame-ter SIG' and 'America'.
    expect(matchesQuery('RV AME TG', 'AME')).toBe(true);
    expect(matchesQuery('RV AME TG', 'ame')).toBe(true);
    expect(matchesQuery('RV Parameter SIG', 'AME')).toBe(false);
    expect(matchesQuery('RISC-V Summit North America', 'AME')).toBe(false);
    expect(matchesQuery('RV Parameter SIG', 'param')).toBe(true);
  });

  it('matches prefixes of any word, case-insensitively', () => {
    expect(matchesQuery('RV Joint Crypto SIG/TGs', 'crypt')).toBe(true);
    expect(matchesQuery('RV Joint Crypto SIG/TGs', 'CRYPTO')).toBe(true);
    expect(matchesQuery('RV Vector SIG', 'vec')).toBe(true);
    expect(matchesQuery('RV Joint Crypto SIG/TGs', 'si')).toBe(true);
    expect(matchesQuery('RV Joint Crypto SIG/TGs', 'tgs')).toBe(true);
    expect(matchesQuery('RV Joint Crypto SIG/TGs', 'tg')).toBe(true);
  });

  it('ANDs multiple terms regardless of order', () => {
    expect(matchesQuery('RV Joint Crypto SIG/TGs', 'crypto sig')).toBe(true);
    expect(matchesQuery('RV Joint Crypto SIG/TGs', 'sig crypto')).toBe(true);
    expect(matchesQuery('RV Joint Crypto SIG/TGs', 'crypto vector')).toBe(false);
  });

  it('supports aliases and quoted phrase searches', () => {
    expect(matchesQuery('RV Floating Point SIG', 'fp')).toBe(true);
    expect(matchesQuery('RV Floating Point SIG', '"floating point"')).toBe(true);
    expect(matchesQuery('RV Point Floating SIG', '"floating point"')).toBe(false);
  });

  it('treats an empty query as no filter', () => {
    expect(matchesQuery('anything', '')).toBe(true);
    expect(matchesQuery('anything', '   ')).toBe(true);
  });

  it('splits on punctuation so slashes and hyphens are word breaks', () => {
    expect(matchesQuery('RV CoVE and CoVE-IO TGs', 'io')).toBe(true);
    expect(matchesQuery('RISC-V Dev Boards Meeting - East-friendly', 'east')).toBe(true);
  });
});

describe('occurrence search', () => {
  const occurrence = (id, iso, title = id) => ({
    id,
    title,
    start: at(iso),
  });

  it('steps through simultaneous matches by occurrence id', () => {
    const matches = [
      occurrence('first', '2026-08-03T14:00:00Z', 'Marketing A'),
      occurrence('second', '2026-08-03T14:00:00Z', 'Marketing B'),
      occurrence('third', '2026-08-10T14:00:00Z', 'Marketing C'),
    ];
    const predicate = (o) => o.title.startsWith('Marketing');

    expect(
      findMatchInOccurrences(matches, {
        predicate,
        from: { startMs: matches[0].start.getTime(), id: 'first' },
      })?.id,
    ).toBe('second');

    expect(
      findMatchInOccurrences(matches, {
        predicate,
        from: { startMs: matches[1].start.getTime(), id: 'second' },
        direction: -1,
      })?.id,
    ).toBe('first');
  });
});

describe('week number and year countdown', () => {
  it('numbers weeks by the ISO Thursday rule', () => {
    expect(isoWeekNumber('2026-08-03')).toBe(32);
    expect(isoWeekNumber('2026-08-09')).toBe(32); // Sunday closes the same week
    expect(isoWeekNumber('2026-08-10')).toBe(33);
    // 1 Jan 2027 is a Friday, so it belongs to week 53 of 2026.
    expect(isoWeekNumber('2027-01-01')).toBe(53);
  });

  it('counts whole days to 31 December', () => {
    expect(daysUntilYearEnd('2026-12-31')).toBe(0);
    expect(daysUntilYearEnd('2026-12-25')).toBe(6);
    expect(daysUntilYearEnd('2026-01-01')).toBe(364);
    expect(daysUntilYearEnd('2028-01-01')).toBe(365); // leap year
  });

  it('counts whole days to the end of the month', () => {
    expect(daysUntilMonthEnd('2026-08-08')).toBe(23);
    expect(daysUntilMonthEnd('2026-08-31')).toBe(0);
    expect(daysUntilMonthEnd('2028-02-01')).toBe(28); // leap year
    expect(daysUntilMonthEnd('2027-02-01')).toBe(27);
  });
});

describe('parseCalendar', () => {
  it('registers the timezones the feed declares', () => {
    const first = events.find((e) => e.startDate.zone?.tzid === 'America/Los_Angeles');
    expect(first).toBeDefined();
  });

  it('folds RECURRENCE-ID overrides into their master instead of listing them twice', () => {
    const uids = events.map((e) => e.uid);
    expect(uids.length).toBe(new Set(uids).size);
  });
});

describe('expand', () => {
  it('produces a stable, ordered set for a fixed week', () => {
    const out = expand(events, at('2026-08-03T00:00:00Z'), at('2026-08-10T00:00:00Z'));
    expect(out.every((o) => o.start instanceof Date && o.end instanceof Date)).toBe(true);
    expect(out.every((o) => o.start < o.end)).toBe(true);
    // Sorted ascending by start.
    const starts = out.map((o) => o.start.getTime());
    expect([...starts].sort((a, b) => a - b)).toEqual(starts);
  });

  it('never emits the same group twice at the same instant', () => {
    const out = expand(events, at('2026-08-01T00:00:00Z'), at('2026-12-01T00:00:00Z'));
    const slots = out.map((o) => `${o.key}@${o.start.getTime()}`);
    expect(slots.length).toBe(new Set(slots).size);
  });

  it('keeps similarly named but genuinely distinct series apart', () => {
    // 'RV-LFX Floating Point SIG' meets on 2nd Mondays and 'RV Floating Point
    // SIG (New)' on 3rd Mondays. Near-identical names, different meetings —
    // deduplication must not merge them.
    const starts = (title) =>
      expand(events, at('2026-08-01T00:00:00Z'), at('2026-10-01T00:00:00Z'))
        .filter((o) => o.title === title)
        .map((o) => o.start.toISOString().slice(0, 10));
    expect(starts('RV-LFX Floating Point SIG')).toEqual(['2026-08-17', '2026-09-14']);
    expect(starts('RV Floating Point SIG')).toEqual(['2026-08-24', '2026-09-21']);
  });

  it('drops exactly the occurrences an EXDATE cancels', () => {
    // Biweekly Tuesdays, with 2026-08-18 cancelled: the series must resume on
    // 09-01 rather than stopping or shifting.
    const automotive = expand(events, at('2026-08-01T00:00:00Z'), at('2026-09-30T00:00:00Z'))
      .filter((o) => o.title === 'RV Automotive SIG')
      .map((o) => o.start.toISOString().slice(0, 10));
    expect(automotive).toContain('2026-08-04');
    expect(automotive).not.toContain('2026-08-18');
    expect(automotive).toContain('2026-09-01');
  });

  it('carries the join URL, meeting id and passcode through to the occurrence', () => {
    const out = expand(events, at('2026-08-03T00:00:00Z'), at('2026-08-10T00:00:00Z'));
    expect(out.length).toBeGreaterThan(0);
    const [first] = out;
    expect(first.joinUrl).toMatch(/^https:\/\/zoom-lfx\.platform\.linuxfoundation\.org\//);
    expect(first.meetingId).toMatch(/^\d+$/);
    expect(first.description).toContain('Passcode');
    expect(first.tzid).toBeTruthy();
  });

  it('holds the local start time steady across a DST transition', () => {
    // A New York series must stay at the same wall-clock time either side of
    // 2026-11-01, even though its UTC offset changes.
    const ny = 'America/New_York';
    const localTimes = (from, to) =>
      expand(events, at(from), at(to))
        .filter((o) => o.tzid === ny)
        .map((o) => formatTimeIn(o.start, ny));
    const before = localTimes('2026-10-05T00:00:00Z', '2026-10-26T00:00:00Z');
    const after = localTimes('2026-11-09T00:00:00Z', '2026-11-30T00:00:00Z');
    expect(before.length).toBeGreaterThan(0);
    expect(after.length).toBeGreaterThan(0);
    expect(new Set([...before, ...after]).size).toBe(1);
  });

  it('returns nothing for a window with no meetings', () => {
    expect(expand(events, at('2026-08-08T00:00:00Z'), at('2026-08-09T00:00:00Z'))).toEqual(
      [],
    );
  });

  it('does not hang on series that recur until the far future', () => {
    // Several LFX rules carry UNTIL dates in the 2100s.
    const started = Date.now();
    expand(events, at('2026-08-03T00:00:00Z'), at('2026-08-10T00:00:00Z'));
    expect(Date.now() - started).toBeLessThan(2000);
  });
});

describe('fetchFeed', () => {
  it('can force network revalidation even while the session cache is fresh', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(at('2026-08-08T14:00:00Z'));
    const store = installSessionStorage();
    store.set(
      calendarConfig.feed.cacheKey,
      JSON.stringify({
        text: FIXTURE,
        etag: '"old"',
        fetchedAt: Date.now(),
      }),
    );
    globalThis.fetch = vi.fn(async () =>
      new Response(`${FIXTURE}\nX-WR-CALNAME:Updated`, {
        status: 200,
        headers: { ETag: '"new"' },
      }),
    );

    const cached = await fetchFeed();
    expect(cached.fromCache).toBe(true);
    expect(globalThis.fetch).not.toHaveBeenCalled();

    const refreshed = await fetchFeed({ force: true });
    expect(refreshed.fromCache).toBe(false);
    expect(refreshed.text).toContain('X-WR-CALNAME:Updated');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        cache: 'no-store',
        headers: { 'If-None-Match': '"old"' },
      }),
    );
  });
});
