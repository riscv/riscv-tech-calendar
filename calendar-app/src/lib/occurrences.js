import ICAL from 'ical.js';
import { classify } from './classify.js';

/**
 * Expands recurring events into concrete occurrences inside a time window.
 *
 * Expansion is always windowed. Several LFX series carry rules like
 * `UNTIL=21230910` — a century of occurrences — so an unbounded expansion
 * would lock the tab. ITER_GUARD is a second backstop for a malformed rule
 * that never advances past the window.
 */

const ITER_GUARD = 5000;

function firstUrlIn(text) {
  const match = String(text ?? '').match(/https?:\/\/\S+/);
  return match ? match[0].replace(/[),.]+$/, '') : null;
}

function detailsOf(event) {
  const comp = event.component;
  return {
    joinUrl:
      firstUrlIn(event.location) ||
      comp.getFirstPropertyValue('url') ||
      firstUrlIn(event.description),
    meetingId: comp.getFirstPropertyValue('x-meeting-id') || null,
    description: event.description || '',
  };
}

function tzidOf(event, startDate) {
  const tzid = startDate.zone?.tzid;
  if (tzid && tzid !== 'floating') return tzid;
  return event.component.getFirstPropertyValue('tzid') || null;
}

function toOccurrence(event, startDate, endDate, details) {
  const start = startDate.toJSDate();
  const { title, kinds, key } = classify(event.summary);
  return {
    id: `${event.uid}::${start.getTime()}`,
    uid: event.uid,
    key,
    title,
    kinds,
    start,
    end: endDate ? endDate.toJSDate() : new Date(start.getTime() + 3600 * 1000),
    tzid: tzidOf(event, startDate),
    ...details,
  };
}

/**
 * Returns every occurrence starting inside [start, end), sorted by time.
 *
 * Duplicates are collapsed on (group key, start instant). LFX leaves old and
 * new entries for the same group in the feed — 'RV Floating Point SIG (New)'
 * and 'RV-LFX Floating Point SIG' are the same meeting — and without this the
 * page shows each of them twice.
 */
export function expand(events, start, end) {
  const windowStart = ICAL.Time.fromJSDate(start, true);
  const windowEnd = ICAL.Time.fromJSDate(end, true);
  const out = [];

  for (const event of events) {
    if (!event.isRecurring()) {
      const s = event.startDate;
      if (s.compare(windowStart) >= 0 && s.compare(windowEnd) < 0) {
        out.push(toOccurrence(event, s, event.endDate, detailsOf(event)));
      }
      continue;
    }

    const iterator = event.iterator();
    let next;
    let guard = 0;
    while ((next = iterator.next()) && guard++ < ITER_GUARD) {
      if (next.compare(windowEnd) >= 0) break;
      if (next.compare(windowStart) < 0) continue;
      let occ;
      try {
        occ = event.getOccurrenceDetails(next);
      } catch {
        continue; // A single bad override should not drop the series.
      }
      out.push(toOccurrence(occ.item, occ.startDate, occ.endDate, detailsOf(occ.item)));
    }
  }

  const seen = new Set();
  return out
    .filter((o) => {
      const dedup = `${o.key}@${o.start.getTime()}`;
      if (seen.has(dedup)) return false;
      seen.add(dedup);
      return true;
    })
    .sort((a, b) => a.start - b.start || a.title.localeCompare(b.title));
}
