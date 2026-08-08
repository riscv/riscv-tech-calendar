import { useEffect, useRef } from 'react';
import { useNow } from '../hooks/useNow.js';
import {
  dayKeyIn,
  formatDayHeading,
  formatTimeIn,
  minutesSinceMidnightIn,
  zoneAbbrev,
} from '../lib/datetime.js';

/**
 * The selected range as a day-by-day list.
 *
 * Used on narrow viewports and for the single-day view, where the time grid
 * cannot show several concurrent meetings without truncating every title.
 */
const LANE_COLOURS = 6;

function laneClassOf(element) {
  return [...(element?.classList ?? [])]
    .filter((name) => name.startsWith('lane-') || name === 'is-past')
    .join(' ');
}

function occurrenceMinutes(occurrence, timeZone) {
  return minutesSinceMidnightIn(occurrence.start, timeZone);
}

function focusAgendaItem(current, direction) {
  const items = [...(current.closest('.agenda')?.querySelectorAll('.agenda-item') ?? [])];
  const index = items.indexOf(current);
  const next = items.at(index + direction);
  if (!next) return;
  next.focus({ preventScroll: true });
  next.scrollIntoView({ block: 'nearest' });
}

export function AgendaList({
  dayKeys,
  occurrences,
  timeZone,
  timeFormat = '24h',
  emptyMessage = 'No meetings match the current filters.',
  onSelect,
  onHover,
  highlightId,
}) {
  const now = useNow();

  // Bring a searched-for meeting into view after the list jumps to its week.
  const matchRef = useRef(null);
  useEffect(() => {
    if (!highlightId) return;
    matchRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [highlightId]);

  const byDay = new Map(dayKeys.map((k) => [k, []]));
  for (const occ of occurrences) {
    byDay.get(dayKeyIn(occ.start, timeZone))?.push(occ);
  }

  // Meetings starting at the same instant get the same colour sequence as the
  // week grid's lanes, so a slot with three meetings reads the same either way.
  const laneOf = new Map();
  const slotCounts = new Map();
  for (const occ of occurrences) {
    const slot = occ.start.getTime();
    const n = slotCounts.get(slot) ?? 0;
    laneOf.set(occ.id, n);
    slotCounts.set(slot, n + 1);
  }

  const populated = dayKeys.filter((k) => byDay.get(k).length > 0);
  const nowMinutes = minutesSinceMidnightIn(now, timeZone);

  if (!populated.length) {
    return <p className="empty-state">{emptyMessage}</p>;
  }

  return (
    <div className="agenda">
      {populated.map((key) => (
        <section key={key} className="agenda-day">
          <h2 className="agenda-heading">{formatDayHeading(key)}</h2>
          <ul className="agenda-items">
            {byDay.get(key).flatMap((occ, index, list) => {
              const past = occ.end < now;
              const shouldInsertMarker =
                index === 0
                  ? occurrenceMinutes(occ, timeZone) >= nowMinutes
                  : occurrenceMinutes(list[index - 1], timeZone) < nowMinutes &&
                    occurrenceMinutes(occ, timeZone) >= nowMinutes;
              // Only worth showing when it differs from what the reader picked.
              const showOrigin = occ.tzid && occ.tzid !== timeZone;
              return [
                shouldInsertMarker && (
                  <li key={`${key}-now`} className="agenda-now">
                    <span>{formatTimeIn(now, timeZone, timeFormat)}</span>
                  </li>
                ),
                <li
                  key={occ.id}
                  ref={occ.id === highlightId ? matchRef : undefined}
                  className={`agenda-row lane-${(laneOf.get(occ.id) ?? 0) % LANE_COLOURS}${
                    past ? ' is-past' : ''
                  }${occ.id === highlightId ? ' is-match' : ''}`}
                >
                  <button
                    type="button"
                    className="agenda-item"
                    onClick={(e) =>
                      onSelect(
                        occ,
                        laneClassOf(e.currentTarget.closest('.agenda-row')),
                      )
                    }
                    onMouseEnter={(e) =>
                      onHover?.(
                        occ,
                        e.currentTarget.getBoundingClientRect(),
                        laneClassOf(e.currentTarget.closest('.agenda-row')),
                      )
                    }
                    onMouseLeave={() => onHover?.(null, null)}
                    onFocus={(e) =>
                      onHover?.(
                        occ,
                        e.currentTarget.getBoundingClientRect(),
                        laneClassOf(e.currentTarget.closest('.agenda-row')),
                      )
                    }
                    onBlur={() => onHover?.(null, null)}
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        focusAgendaItem(e.currentTarget, 1);
                      }
                      if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        focusAgendaItem(e.currentTarget, -1);
                      }
                      if (e.key === 'Home') {
                        e.preventDefault();
                        e.currentTarget
                          .closest('.agenda')
                          ?.querySelector('.agenda-item')
                          ?.focus({ preventScroll: true });
                      }
                      if (e.key === 'End') {
                        e.preventDefault();
                        const items = [
                          ...(e.currentTarget
                            .closest('.agenda')
                            ?.querySelectorAll('.agenda-item') ?? []),
                        ];
                        items.at(-1)?.focus({ preventScroll: true });
                      }
                    }}
                  >
                    <span className="agenda-time">
                      <span className="agenda-time-main">
                        {formatTimeIn(occ.start, timeZone, timeFormat)}
                        <span className="agenda-time-end">
                          {formatTimeIn(occ.end, timeZone, timeFormat)}
                        </span>
                      </span>
                      {showOrigin && (
                        <span className="agenda-time-origin">
                          {formatTimeIn(occ.start, occ.tzid, timeFormat)}{' '}
                          {zoneAbbrev(occ.start, occ.tzid)}
                        </span>
                      )}
                    </span>
                    <span className="agenda-title">{occ.title}</span>
                    <span className="agenda-kinds">
                      {occ.kinds.map((k) => (
                        <span key={k} className={`kind-tag kind-${k.toLowerCase()}`}>
                          {k}
                        </span>
                      ))}
                    </span>
                  </button>
                  {occ.joinUrl && (
                    <a
                      className="agenda-join"
                      href={occ.joinUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Join ↗
                    </a>
                  )}
                </li>
              ].filter(Boolean);
            })}
            {occurrenceMinutes(byDay.get(key).at(-1), timeZone) < nowMinutes && (
              <li className="agenda-now">
                <span>{formatTimeIn(now, timeZone, timeFormat)}</span>
              </li>
            )}
          </ul>
        </section>
      ))}
    </div>
  );
}
