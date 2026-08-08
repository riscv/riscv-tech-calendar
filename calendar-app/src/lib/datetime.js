/**
 * Timezone-aware date helpers.
 *
 * Every meeting instant is a plain JS Date (an absolute point in time). All
 * conversion to a user-facing wall clock happens here, against an explicitly
 * passed IANA zone, so the rest of the app never does timezone arithmetic.
 *
 * Day keys are 'YYYY-MM-DD' strings. Arithmetic on them is done in UTC at
 * noon, which keeps it clear of DST transitions (no zone shifts 12 hours).
 */

const dayKeyFormatters = new Map();
const hourMinuteFormatters = new Map();

function dayKeyFormatter(timeZone) {
  let fmt = dayKeyFormatters.get(timeZone);
  if (!fmt) {
    // en-CA yields ISO-shaped YYYY-MM-DD.
    fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    dayKeyFormatters.set(timeZone, fmt);
  }
  return fmt;
}

function hourMinuteFormatter(timeZone, timeFormat = '24h') {
  const key = `${timeZone}:${timeFormat}`;
  let fmt = hourMinuteFormatters.get(key);
  if (!fmt) {
    const twelveHour = timeFormat === '12h';
    fmt = new Intl.DateTimeFormat(twelveHour ? 'en-US' : 'en-GB', {
      timeZone,
      hour: twelveHour ? 'numeric' : '2-digit',
      minute: '2-digit',
      ...(twelveHour ? { hour12: true } : { hourCycle: 'h23' }),
    });
    hourMinuteFormatters.set(key, fmt);
  }
  return fmt;
}

/** The calendar day a given instant falls on, in `timeZone`. */
export function dayKeyIn(date, timeZone) {
  return dayKeyFormatter(timeZone).format(date);
}

/** Minutes elapsed since local midnight in `timeZone`. Positions events on the grid. */
export function minutesSinceMidnightIn(date, timeZone) {
  const parts = hourMinuteFormatter(timeZone).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === 'hour').value);
  const minute = Number(parts.find((p) => p.type === 'minute').value);
  return hour * 60 + minute;
}

/** Wall-clock time for display, e.g. '14:30'. */
export function formatTimeIn(date, timeZone, timeFormat = '24h') {
  return hourMinuteFormatter(timeZone, timeFormat).format(date);
}

const abbrevFormatters = new Map();

/**
 * Short zone label for the given instant, e.g. 'PDT' or 'GMT-3'.
 *
 * Takes a date because the abbreviation changes with DST — the same zone is
 * PST in January and PDT in July.
 */
export function zoneAbbrev(date, timeZone) {
  let fmt = abbrevFormatters.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'short' });
    abbrevFormatters.set(timeZone, fmt);
  }
  const part = fmt.formatToParts(date).find((p) => p.type === 'timeZoneName');
  return part ? part.value : timeZone;
}

/** Parse 'YYYY-MM-DD' to a UTC-noon Date, safely away from any DST boundary. */
function keyToNoonUTC(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

/** Shift a day key by n days. Pure string/UTC math — no timezone involved. */
export function addDaysToKey(key, n) {
  const dt = keyToNoonUTC(key);
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

/** 0 = Monday … 6 = Sunday. */
export function weekdayIndexOfKey(key) {
  return (keyToNoonUTC(key).getUTCDay() + 6) % 7;
}

/** The Monday of the week containing `key`. */
export function startOfWeekKey(key) {
  return addDaysToKey(key, -weekdayIndexOfKey(key));
}

/** The seven day keys of the week beginning at `mondayKey`. */
export function weekKeys(mondayKey) {
  return Array.from({ length: 7 }, (_, i) => addDaysToKey(mondayKey, i));
}

/**
 * A UTC instant window guaranteed to contain every occurrence that could land
 * on any of `keys` in any timezone. Padded 36h either side, since a local
 * calendar day can begin up to 14h before, and end up to 12h after, the same
 * UTC date. Callers filter precisely afterwards with dayKeyIn().
 */
export function windowForKeys(keys) {
  const first = keyToNoonUTC(keys[0]);
  const last = keyToNoonUTC(keys[keys.length - 1]);
  return {
    start: new Date(first.getTime() - 36 * 3600 * 1000),
    end: new Date(last.getTime() + 36 * 3600 * 1000),
  };
}

/**
 * The first UTC instant that belongs to local day `key` in `timeZone`.
 *
 * This avoids guessing with a fixed UTC offset when search needs to start at
 * the user's visible calendar boundary.
 */
export function localDayStart(key, timeZone) {
  const [y, m, d] = key.split('-').map(Number);
  let lo = Date.UTC(y, m - 1, d) - 36 * 3600 * 1000;
  let hi = Date.UTC(y, m - 1, d) + 36 * 3600 * 1000;

  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (dayKeyIn(new Date(mid), timeZone) < key) lo = mid + 1;
    else hi = mid;
  }

  return new Date(lo);
}

/** Human day heading, e.g. 'Monday · 10 Aug 2026'. */
export function formatDayHeading(key) {
  const noon = keyToNoonUTC(key);
  const weekday = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    weekday: 'long',
  }).format(noon);
  const rest = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(noon);
  return `${weekday} · ${rest}`;
}

/** Short column heading for the week grid, e.g. 'Mon 10'. */
export function formatColumnHeading(key) {
  const noon = keyToNoonUTC(key);
  const weekday = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    weekday: 'short',
  }).format(noon);
  return `${weekday} ${noon.getUTCDate()}`;
}

/** Today's day key in `timeZone`. */
export function todayKeyIn(timeZone) {
  return dayKeyIn(new Date(), timeZone);
}

/** The 'YYYY-MM' a key belongs to — used to grey out a mini-month's spill days. */
export function monthOfKey(key) {
  return key.slice(0, 7);
}

/** Day-of-month as a number, for rendering a cell label. */
export function dayOfMonth(key) {
  return Number(key.slice(8, 10));
}

export function startOfMonthKey(key) {
  return `${key.slice(0, 7)}-01`;
}

/** Shift by whole months, anchored to the 1st so month lengths never matter. */
export function addMonthsToKey(key, n) {
  const [y, m] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1, 12)).toISOString().slice(0, 10);
}

/**
 * The 42 day keys of a mini-month grid: six Monday-aligned weeks covering the
 * month plus its spill days. Always 42, so the calendar does not change height
 * as the user pages between months.
 */
export function monthGridKeys(anchorKey) {
  const gridStart = startOfWeekKey(startOfMonthKey(anchorKey));
  return Array.from({ length: 42 }, (_, i) => addDaysToKey(gridStart, i));
}

/**
 * ISO-8601 week number.
 *
 * A week belongs to the year containing its Thursday, which is why this hops
 * to Thursday first rather than counting from 1 January — otherwise the days
 * either side of New Year land in the wrong week.
 */
export function isoWeekNumber(key) {
  const thursday = keyToNoonUTC(key);
  const mondayIndex = (thursday.getUTCDay() + 6) % 7;
  thursday.setUTCDate(thursday.getUTCDate() - mondayIndex + 3);

  const firstThursday = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4, 12));
  const firstIndex = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstIndex + 3);

  return 1 + Math.round((thursday - firstThursday) / (7 * 24 * 3600 * 1000));
}

/** Whole days from `key` to 31 December of the same year. */
export function daysUntilYearEnd(key) {
  const day = keyToNoonUTC(key);
  const yearEnd = Date.UTC(day.getUTCFullYear(), 11, 31, 12);
  return Math.round((yearEnd - day.getTime()) / (24 * 3600 * 1000));
}

/** Whole days from `key` to the final day of that same month. */
export function daysUntilMonthEnd(key) {
  const day = keyToNoonUTC(key);
  const monthEnd = Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + 1, 0, 12);
  return Math.round((monthEnd - day.getTime()) / (24 * 3600 * 1000));
}

/** e.g. 'August 2026'. */
export function formatMonthLabel(key) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  }).format(keyToNoonUTC(key));
}
