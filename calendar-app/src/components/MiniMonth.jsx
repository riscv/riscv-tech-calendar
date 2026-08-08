import {
  dayOfMonth,
  formatDayHeading,
  formatMonthLabel,
  monthGridKeys,
  monthOfKey,
  startOfMonthKey,
} from '../lib/datetime.js';

// Monday-first, matching the week grid. Indices are the React keys because the
// initials repeat (two T's, two S's).
const WEEKDAY_INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/**
 * Compact month calendar for jumping around the year.
 *
 * Always renders six weeks so paging between months does not change its
 * height and shift the layout underneath it.
 */
export function MiniMonth({
  anchorKey,
  selectedKey,
  todayKey,
  weekKeysShown = [],
  onSelectDay,
  onChangeMonth,
}) {
  const cells = monthGridKeys(anchorKey);
  const currentMonth = monthOfKey(startOfMonthKey(anchorKey));
  const inWeek = new Set(weekKeysShown);

  return (
    <div className="minimonth">
      <div className="minimonth-head">
        <button type="button" onClick={() => onChangeMonth(-1)} aria-label="Previous month">
          ‹
        </button>
        <span className="minimonth-label">{formatMonthLabel(anchorKey)}</span>
        <button type="button" onClick={() => onChangeMonth(1)} aria-label="Next month">
          ›
        </button>
      </div>

      <div className="minimonth-grid">
        {WEEKDAY_INITIALS.map((initial, i) => (
          <span key={i} className="minimonth-dow" aria-hidden="true">
            {initial}
          </span>
        ))}

        {cells.map((key) => {
          const classes = ['minimonth-day'];
          if (monthOfKey(key) !== currentMonth) classes.push('is-outside');
          if (inWeek.has(key)) classes.push('is-inweek');
          if (key === todayKey) classes.push('is-today');
          if (key === selectedKey) classes.push('is-selected');
          return (
            <button
              key={key}
              type="button"
              className={classes.join(' ')}
              aria-current={key === todayKey ? 'date' : undefined}
              aria-label={formatDayHeading(key)}
              onClick={() => onSelectDay(key)}
            >
              {dayOfMonth(key)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
