import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNow } from '../hooks/useNow.js';
import {
  dayKeyIn,
  formatColumnHeading,
  formatTimeIn,
  localDayStart,
  minutesSinceMidnightIn,
  zoneAbbrev,
} from '../lib/datetime.js';

// Rows keep a constant, readable height. A long day makes the grid taller than
// the viewport, and the body scrolls under a pinned day header rather than
// squashing every row to fit.
const HOUR_HEIGHT = 54; // px
const MIN_SLOT_MINUTES = 30;
const DAY_START_HOUR = 0;
const DAY_END_HOUR = 24;

// Three or more meetings sharing a slot leaves each lane too narrow for a
// separate time line, so the title gets the whole box.
const CROWDED_LANES = 3;
const TIME_LINE_MIN_HEIGHT = 50; // px
const CURRENT_HOUR_FOCUS_RATIO = 0.22;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const TIME_RAILS = [
  { key: 'pacific', timeZone: 'America/Los_Angeles' },
  { key: 'central', timeZone: 'America/Chicago' },
  { key: 'china', timeZone: 'Asia/Shanghai', label: 'China' },
];

/**
 * Places overlapping meetings side by side.
 *
 * Events are grouped into clusters of mutually overlapping items, then each
 * gets the leftmost lane free at its start time. Every member of a cluster is
 * told the cluster's total lane count so they can each take an equal share of
 * the column width. Without this, the Monday 13:00 slot — four concurrent
 * meetings — would render as four stacked, unreadable boxes.
 */
function layoutDay(items) {
  const sorted = [...items].sort((a, b) => a.start - b.start || a.end - b.end);
  const placed = [];
  let cluster = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    if (!cluster.length) return;
    const laneEnds = [];
    const lanes = new Map();
    for (const item of cluster) {
      let lane = laneEnds.findIndex((endsAt) => endsAt <= item.start.getTime());
      if (lane === -1) lane = laneEnds.length;
      laneEnds[lane] = item.end.getTime();
      lanes.set(item.id, lane);
    }
    for (const item of cluster) {
      placed.push({ occ: item, lane: lanes.get(item.id), lanes: laneEnds.length });
    }
    cluster = [];
    clusterEnd = -Infinity;
  };

  for (const item of sorted) {
    if (cluster.length && item.start.getTime() >= clusterEnd) flush();
    cluster.push(item);
    clusterEnd = Math.max(clusterEnd, item.end.getTime());
  }
  flush();
  return placed;
}

// Distinct hues so meetings sharing a slot are separable at a glance. Lane 0
// keeps the familiar RISC-V blue; the rest cycle.
const LANE_COLOURS = 6;

function laneClassOf(element) {
  return [...element.classList]
    .filter((name) => name.startsWith('lane-') || name === 'is-past')
    .join(' ');
}

function focusInScrollArea(element, scroller) {
  if (!scroller || scroller.scrollHeight <= scroller.clientHeight) return false;

  const scrollerRect = scroller.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();
  const top = elementRect.top - scrollerRect.top + scroller.scrollTop;
  const stickyHeaderHeight =
    element.closest('.weekgrid')?.querySelector('.weekgrid-head')?.getBoundingClientRect()
      .height ?? 0;
  const visibleHeight = scroller.clientHeight - stickyHeaderHeight;
  scroller.scrollTop =
    top -
    stickyHeaderHeight -
    visibleHeight * CURRENT_HOUR_FOCUS_RATIO +
    elementRect.height / 2;
  return true;
}

function resetScrollArea(scroller) {
  if (!scroller) return false;
  scroller.scrollTop = 0;
  return true;
}

function focusSiblingEvent(current, direction) {
  const root = current.closest('.weekgrid');
  if (!root) return;
  const events = [...root.querySelectorAll('.weekgrid-event')];
  const index = events.indexOf(current);
  const next = events.at(index + direction);
  if (!next) return;
  next.focus({ preventScroll: true });
  next.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function dayOffsetLabel(baseKey, targetKey) {
  if (baseKey === targetKey) return '';
  const base = Date.parse(`${baseKey}T00:00:00Z`);
  const target = Date.parse(`${targetKey}T00:00:00Z`);
  const diff = Math.round((target - base) / DAY_MS);
  return diff > 0 ? `+${diff}` : String(diff);
}

export function WeekGrid({
  dayKeys,
  occurrences,
  timeZone,
  timeFormat = '24h',
  onSelect,
  onHover,
  highlightId,
  scrollContainerRef,
  focusDayKey,
}) {
  // Drives both the now-line and the greying of finished meetings.
  const now = useNow();
  const [clusterPopover, setClusterPopover] = useState(null);

  // The full-day grid is taller than the viewport, so a searched-for meeting
  // can land off-screen. Bring it into view when the search jumps to it.
  const gridRef = useRef(null);
  const matchRef = useRef(null);
  const currentHourRef = useRef(null);
  const fallbackFocusRef = useRef(null);
  const focusedNowKeyRef = useRef(null);
  const clusterPopoverRef = useRef(null);
  useEffect(() => {
    if (!highlightId) return;
    matchRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [highlightId]);

  useEffect(() => {
    if (!clusterPopover) return undefined;
    const close = (e) => {
      if (e.key === 'Escape') setClusterPopover(null);
    };
    const closeOutside = (e) => {
      if (clusterPopoverRef.current?.contains(e.target)) return;
      setClusterPopover(null);
    };
    document.addEventListener('keydown', close);
    document.addEventListener('pointerdown', closeOutside);
    return () => {
      document.removeEventListener('keydown', close);
      document.removeEventListener('pointerdown', closeOutside);
    };
  }, [clusterPopover]);

  const byDay = new Map(dayKeys.map((k) => [k, []]));
  for (const occ of occurrences) {
    byDay.get(dayKeyIn(occ.start, timeZone))?.push(occ);
  }

  const preferredFocusDay = dayKeys.includes(focusDayKey) ? focusDayKey : dayKeys[0];
  const fallbackFocus =
    byDay.get(preferredFocusDay)?.[0] ??
    dayKeys.map((key) => byDay.get(key)?.[0]).find(Boolean) ??
    null;

  const startHour = DAY_START_HOUR;
  const endHour = DAY_END_HOUR;
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  const firstDayStart = localDayStart(dayKeys[0], timeZone);
  const rails = [
    ...TIME_RAILS.map((rail) => ({
      ...rail,
      label: rail.label ?? zoneAbbrev(firstDayStart, rail.timeZone),
      local: false,
    })),
    {
      key: 'selected',
      timeZone,
      label: zoneAbbrev(firstDayStart, timeZone),
      local: true,
    },
  ];
  const hourRows = hours.map((h) => {
    const instant = new Date(firstDayStart.getTime() + (h - startHour) * HOUR_MS);
    const selectedDayKey = dayKeyIn(instant, timeZone);
    return {
      hour: h,
      values: rails.map((rail) => {
        const railDayKey = dayKeyIn(instant, rail.timeZone);
        return {
          ...rail,
          time: formatTimeIn(instant, rail.timeZone, timeFormat),
          offset: rail.local ? '' : dayOffsetLabel(selectedDayKey, railDayKey),
        };
      }),
    };
  });

  const hourHeight = HOUR_HEIGHT;
  const gridHeight = hours.length * hourHeight;

  // Mark the current time-of-day across every visible day. This is a time
  // guide, not a "today only" indicator, so it remains useful on other weeks.
  const todayKey = dayKeyIn(now, timeZone);
  const nowMinutes = minutesSinceMidnightIn(now, timeZone);
  const nowOffset = ((nowMinutes - startHour * 60) / 60) * hourHeight;
  const currentHourCenterOffset =
    ((Math.floor(nowMinutes / 60) * 60 + 30 - startHour * 60) / 60) * hourHeight;
  const fallbackFocusOffset = fallbackFocus
    ? ((minutesSinceMidnightIn(fallbackFocus.start, timeZone) - startHour * 60) / 60) *
      hourHeight
    : 0;
  const fallbackFocusDay = fallbackFocus ? dayKeyIn(fallbackFocus.start, timeZone) : null;
  const showTimeMarker = nowMinutes >= startHour * 60 && nowMinutes <= endHour * 60;

  useLayoutEffect(() => {
    const fallbackKey = fallbackFocus
      ? `${fallbackFocus.id}:${fallbackFocus.start.getTime()}`
      : 'none';
    const focusKey = `${todayKey}:${timeZone}:${dayKeys.join(',')}:${fallbackKey}`;

    // Search-result jumps should own the scroll position. Mark the current
    // range as handled so clearing the highlight does not pull the user back
    // to the automatic focus target a few seconds later.
    if (highlightId) {
      focusedNowKeyRef.current = focusKey;
      return undefined;
    }

    if (focusedNowKeyRef.current === focusKey) return undefined;

    let attempts = 0;
    let frame = 0;
    const focus = () => {
      attempts += 1;
      const target = showTimeMarker ? currentHourRef.current : fallbackFocusRef.current;
      if (!target && !showTimeMarker && !fallbackFocus) {
        if (resetScrollArea(scrollContainerRef?.current)) {
          focusedNowKeyRef.current = focusKey;
          return;
        }
      }
      const done =
        target && focusInScrollArea(target, scrollContainerRef?.current);
      if (done) {
        focusedNowKeyRef.current = focusKey;
        return;
      }
      if (attempts < 8) frame = requestAnimationFrame(focus);
    };

    frame = requestAnimationFrame(focus);
    return () => cancelAnimationFrame(frame);
  }, [dayKeys, fallbackFocus, highlightId, scrollContainerRef, showTimeMarker, timeZone, todayKey]);

  return (
    <div className="weekgrid" ref={gridRef}>
      <div className="weekgrid-head">
        <div className="weekgrid-gutter-head">
          {rails.map((rail) => (
            <span
              key={rail.key}
              className={rail.local ? 'is-local' : undefined}
              title={rail.timeZone}
            >
              {rail.label}
            </span>
          ))}
        </div>
        {dayKeys.map((key) => (
          <div
            key={key}
            className={`weekgrid-col-head${key === todayKey ? ' is-today' : ''}`}
          >
            {formatColumnHeading(key)}
          </div>
        ))}
      </div>

      <div className="weekgrid-body">
        {showTimeMarker && (
          <>
            <div
              ref={currentHourRef}
              className="weekgrid-now-focus"
              style={{ top: currentHourCenterOffset }}
              role="presentation"
              aria-hidden="true"
            />
            <div
              className="weekgrid-now"
              style={{ top: nowOffset }}
              role="presentation"
              aria-hidden="true"
              title={`Current time — ${formatTimeIn(now, timeZone, timeFormat)}`}
            />
          </>
        )}

        <div className="weekgrid-gutter" style={{ height: gridHeight }}>
          {hourRows.map((row) => (
            <div
              key={row.hour}
              className="weekgrid-hour-label"
              style={{ height: hourHeight }}
              title={row.values
                .map((value) => `${value.time}${value.offset ? ` ${value.offset}` : ''} ${value.label}`)
                .join(' / ')}
            >
              {row.values.map((value) => (
                <span
                  key={value.key}
                  className={`weekgrid-hour-rail${value.local ? ' is-local' : ''}`}
                  data-rail={value.key}
                >
                  {value.time}
                  {value.offset && (
                    <small className="weekgrid-hour-offset"> {value.offset}</small>
                  )}
                </span>
              ))}
            </div>
          ))}
        </div>

        {dayKeys.map((key) => {
          const placed = layoutDay(byDay.get(key));
          const slotGroups = new Map();
          for (const item of placed) {
            const startMs = item.occ.start.getTime();
            const group = slotGroups.get(startMs) ?? [];
            group.push(item);
            slotGroups.set(startMs, group);
          }
          const crowdedSlots = [...slotGroups.values()].filter(
            (group) => group.length >= CROWDED_LANES,
          );

          return (
            <div
              key={key}
              className={`weekgrid-col${key === todayKey ? ' is-today' : ''}`}
              style={{ height: gridHeight }}
            >
              {hours.map((h) => (
                <div key={h} className="weekgrid-hour-line" style={{ height: hourHeight }} />
              ))}

              {!showTimeMarker && fallbackFocus && key === fallbackFocusDay && (
                <div
                  ref={fallbackFocusRef}
                  className="weekgrid-now-focus"
                  style={{ top: fallbackFocusOffset }}
                  role="presentation"
                  aria-hidden="true"
                />
              )}

              {placed.map(({ occ, lane, lanes }) => {
                const startMin = minutesSinceMidnightIn(occ.start, timeZone);
                const endMin = minutesSinceMidnightIn(occ.end, timeZone);
                const durationMin = Math.max(
                  MIN_SLOT_MINUTES,
                  endMin > startMin ? endMin - startMin : 60,
                );
                // A 30-minute meeting in a compressed row is barely tall enough
                // for one line, which truncates the title to a couple of
                // characters. Floor the box so a wrapped title always fits.
                const boxHeight = Math.max(34, (durationMin / 60) * hourHeight - 2);
                // The time line costs a whole row of text. Drop it whenever the
                // box is too short or too narrow to spare one for the title.
                const crowded = lanes >= CROWDED_LANES || boxHeight < TIME_LINE_MIN_HEIGHT;
                const past = occ.end < now;
                // The box is far too narrow to print both zones, so the tooltip
                // carries the meeting's own scheduled time alongside the local one.
                const localSpan = `${formatTimeIn(occ.start, timeZone, timeFormat)}–${formatTimeIn(occ.end, timeZone, timeFormat)} ${zoneAbbrev(occ.start, timeZone)}`;
                const originSpan =
                  occ.tzid && occ.tzid !== timeZone
                    ? `\nScheduled ${formatTimeIn(occ.start, occ.tzid, timeFormat)} ${zoneAbbrev(occ.start, occ.tzid)} (${occ.tzid})`
                    : '';
                return (
                  <button
                    key={occ.id}
                    type="button"
                    ref={occ.id === highlightId ? matchRef : undefined}
                    className={`weekgrid-event lane-${lane % LANE_COLOURS}${
                      crowded ? ' is-crowded' : ''
                    }${past ? ' is-past' : ''}${occ.id === highlightId ? ' is-match' : ''}`}
                    onClick={(e) => onSelect(occ, laneClassOf(e.currentTarget))}
                    onMouseEnter={(e) =>
                      onHover?.(
                        occ,
                        e.currentTarget.getBoundingClientRect(),
                        laneClassOf(e.currentTarget),
                      )
                    }
                    onMouseLeave={() => onHover?.(null, null)}
                    onFocus={(e) =>
                      onHover?.(
                        occ,
                        e.currentTarget.getBoundingClientRect(),
                        laneClassOf(e.currentTarget),
                      )
                    }
                    onBlur={() => onHover?.(null, null)}
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                        e.preventDefault();
                        focusSiblingEvent(e.currentTarget, 1);
                      }
                      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                        e.preventDefault();
                        focusSiblingEvent(e.currentTarget, -1);
                      }
                    }}
                    aria-label={`${occ.title}. ${localSpan}${originSpan.replace('\n', '. ')}`}
                    style={{
                      top: ((startMin - startHour * 60) / 60) * hourHeight,
                      height: boxHeight,
                      left: `calc(${(lane / lanes) * 100}% + 2px)`,
                      width: `calc(${100 / lanes}% - 4px)`,
                    }}
                  >
                    {crowded && lanes > 1 && (
                      <span className="weekgrid-event-count" aria-hidden="true">
                        {lane + 1}/{lanes}
                      </span>
                    )}
                    {!crowded && (
                      <span className="weekgrid-event-time">
                        {formatTimeIn(occ.start, timeZone, timeFormat)}
                      </span>
                    )}
                    <span className="weekgrid-event-title">{occ.title}</span>
                  </button>
                );
              })}

              {crowdedSlots.map((group) => {
                const [{ occ }] = group;
                const startMin = minutesSinceMidnightIn(occ.start, timeZone);
                return (
                  <button
                    key={`${key}-${occ.start.getTime()}-cluster`}
                    type="button"
                    className="weekgrid-cluster"
                    style={{ top: ((startMin - startHour * 60) / 60) * hourHeight + 3 }}
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setClusterPopover({
                        items: group,
                        label: formatTimeIn(occ.start, timeZone, timeFormat),
                        top: rect.bottom + 6,
                        left: Math.max(12, Math.min(rect.left, window.innerWidth - 290)),
                      });
                    }}
                    aria-label={`${group.length} meetings at ${formatTimeIn(occ.start, timeZone, timeFormat)}`}
                  >
                    {group.length} at {formatTimeIn(occ.start, timeZone, timeFormat)}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      {clusterPopover && (
        <div
          ref={clusterPopoverRef}
          className="cluster-popover"
          role="dialog"
          aria-label={`Meetings at ${clusterPopover.label}`}
          style={{ top: clusterPopover.top, left: clusterPopover.left }}
        >
          <header className="cluster-popover-head">
            <span>{clusterPopover.label}</span>
            <button
              type="button"
              onClick={() => setClusterPopover(null)}
              aria-label="Close same-time meetings"
            >
              ×
            </button>
          </header>
          <div className="cluster-popover-list">
            {clusterPopover.items.map(({ occ, lane }) => {
              const past = occ.end < now;
              const laneClass = `lane-${lane % LANE_COLOURS}${past ? ' is-past' : ''}`;
              return (
                <button
                  key={occ.id}
                  type="button"
                  className={`cluster-popover-item ${laneClass}`}
                  onClick={() => {
                    setClusterPopover(null);
                    onSelect(occ, laneClass);
                  }}
                >
                  <span>{occ.title}</span>
                  <small>
                    {formatTimeIn(occ.start, timeZone, timeFormat)}–
                    {formatTimeIn(occ.end, timeZone, timeFormat)}
                  </small>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
