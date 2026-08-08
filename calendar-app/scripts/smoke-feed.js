/* global process */

import { fetchFeed } from '../src/lib/feed.js';
import { parseCalendar } from '../src/lib/ics.js';
import { expand } from '../src/lib/occurrences.js';
import {
  dayKeyIn,
  startOfWeekKey,
  todayKeyIn,
  weekKeys,
  windowForKeys,
} from '../src/lib/datetime.js';

const timeZone = process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const weekStart = startOfWeekKey(todayKeyIn(timeZone));
const keys = weekKeys(weekStart);
const { start, end } = windowForKeys(keys);

const feed = await fetchFeed({ force: true });
const events = parseCalendar(feed.text);
const occurrences = expand(events, start, end).filter((occ) =>
  keys.includes(dayKeyIn(occ.start, timeZone)),
);

if (!events.length) {
  throw new Error('Live LFX feed parsed successfully but contained no events');
}

if (!occurrences.length) {
  throw new Error(`Live LFX feed has no meetings for ${weekStart} in ${timeZone}`);
}

const counts = occurrences.reduce(
  (acc, occ) => {
    for (const kind of occ.kinds) acc[kind] = (acc[kind] ?? 0) + 1;
    return acc;
  },
  {},
);

console.log(
  JSON.stringify(
    {
      source: 'LFX calendar feed',
      fetchedAt: new Date(feed.fetchedAt).toISOString(),
      timeZone,
      weekStart,
      events: events.length,
      occurrences: occurrences.length,
      counts,
    },
    null,
    2,
  ),
);
