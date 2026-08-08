import { dayKeyIn, formatDayHeading, formatTimeIn, zoneAbbrev } from '../lib/datetime.js';
import { passcodeOf } from '../lib/meetingDetails.js';

/**
 * The facts about one meeting.
 *
 * Shared by the hover card and the click-through dialog so the two can never
 * drift apart — hovering and clicking show the same thing.
 */
export function EventFacts({ occurrence, timeZone, timeFormat = '24h' }) {
  const dayKey = dayKeyIn(occurrence.start, timeZone);
  const passcode = passcodeOf(occurrence.description);
  const elsewhere = occurrence.tzid && occurrence.tzid !== timeZone;

  return (
    <>
      {elsewhere && (
        <p className="timezone-note">
          Shown in {timeZone}; scheduled in {occurrence.tzid}.
        </p>
      )}

      <dl className="detail-body">
        <dt>Your time</dt>
        <dd>
          {formatDayHeading(dayKey)}
          <br />
          {formatTimeIn(occurrence.start, timeZone, timeFormat)}–
          {formatTimeIn(occurrence.end, timeZone, timeFormat)}{' '}
          <span className="detail-zone">
            {zoneAbbrev(occurrence.start, timeZone)} · {timeZone}
          </span>
        </dd>

        {elsewhere && (
          <>
            <dt>Scheduled</dt>
            <dd>
              {formatTimeIn(occurrence.start, occurrence.tzid, timeFormat)}–
              {formatTimeIn(occurrence.end, occurrence.tzid, timeFormat)}{' '}
              <span className="detail-zone">
                {zoneAbbrev(occurrence.start, occurrence.tzid)} · {occurrence.tzid}
              </span>
            </dd>
          </>
        )}

        <dt>Type</dt>
        <dd>
          {occurrence.kinds.map((k) => (
            <span key={k} className={`kind-tag kind-${k.toLowerCase()}`}>
              {k}
            </span>
          ))}
        </dd>

        {occurrence.meetingId && (
          <>
            <dt>Meeting ID</dt>
            <dd>{occurrence.meetingId}</dd>
          </>
        )}

        {passcode && (
          <>
            <dt>Passcode</dt>
            <dd>{passcode}</dd>
          </>
        )}
      </dl>
    </>
  );
}
