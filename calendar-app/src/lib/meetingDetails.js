import { dayKeyIn, formatDayHeading, formatTimeIn, zoneAbbrev } from './datetime.js';

/** Passcode is the one genuinely useful line buried in the Zoom boilerplate. */
export function passcodeOf(description) {
  const match = String(description ?? '').match(/Meeting Passcode:\s*(\S+)/i);
  return match ? match[1] : null;
}

export function meetingDetailsText(occurrence, timeZone, timeFormat = '24h') {
  const dayKey = dayKeyIn(occurrence.start, timeZone);
  const passcode = passcodeOf(occurrence.description);
  const lines = [
    occurrence.title,
    '',
    `Your time: ${formatDayHeading(dayKey)} ${formatTimeIn(
      occurrence.start,
      timeZone,
      timeFormat,
    )}-${formatTimeIn(occurrence.end, timeZone, timeFormat)} ${zoneAbbrev(
      occurrence.start,
      timeZone,
    )} (${timeZone})`,
  ];

  if (occurrence.tzid && occurrence.tzid !== timeZone) {
    lines.push(
      `Scheduled: ${formatTimeIn(occurrence.start, occurrence.tzid, timeFormat)}-${formatTimeIn(
        occurrence.end,
        occurrence.tzid,
        timeFormat,
      )} ${zoneAbbrev(occurrence.start, occurrence.tzid)} (${occurrence.tzid})`,
    );
  }

  lines.push(`Type: ${occurrence.kinds.join(', ')}`);
  if (occurrence.meetingId) lines.push(`Meeting ID: ${occurrence.meetingId}`);
  if (passcode) lines.push(`Passcode: ${passcode}`);
  if (occurrence.joinUrl) lines.push('', `Join: ${occurrence.joinUrl}`);

  return lines.join('\n');
}
