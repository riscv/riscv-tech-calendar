import ICAL from 'ical.js';

/**
 * Parses ICS text into master events ready for recurrence expansion.
 *
 * Two things here are easy to get wrong, and both silently corrupt the
 * calendar rather than throwing:
 *
 *  1. The feed's VTIMEZONE blocks must be registered before any TZID
 *     reference resolves, otherwise ical.js falls back to floating time and
 *     every meeting drifts by the UTC offset.
 *  2. A moved occurrence appears as a separate VEVENT sharing the master's
 *     UID plus a RECURRENCE-ID. It has to be attached to its master via
 *     relateException(), or it renders twice — once at the old slot and once
 *     at the new one.
 */
export function parseCalendar(text) {
  const comp = new ICAL.Component(ICAL.parse(text));

  for (const vt of comp.getAllSubcomponents('vtimezone')) {
    const tz = new ICAL.Timezone(vt);
    if (!ICAL.TimezoneService.has(tz.tzid)) {
      ICAL.TimezoneService.register(tz.tzid, tz);
    }
  }

  const masters = new Map();
  const exceptions = [];

  for (const ve of comp.getAllSubcomponents('vevent')) {
    let event;
    try {
      event = new ICAL.Event(ve);
    } catch {
      continue; // Skip a malformed entry rather than lose the whole calendar.
    }
    if (event.isRecurrenceException()) {
      exceptions.push(event);
    } else if (event.uid) {
      masters.set(event.uid, event);
    }
  }

  for (const ex of exceptions) {
    const master = masters.get(ex.uid);
    if (master) {
      master.relateException(ex);
    } else {
      // Orphaned override — no master in the feed, so show it standalone.
      masters.set(`${ex.uid}::${ex.recurrenceId}`, ex);
    }
  }

  return [...masters.values()];
}
