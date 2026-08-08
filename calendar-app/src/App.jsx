import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import riscvLogo from './assets/riscv-logo.png';
import { AgendaList } from './components/AgendaList.jsx';
import { EventDetail } from './components/EventDetail.jsx';
import { EventHoverCard } from './components/EventHoverCard.jsx';
import { FilterBar } from './components/FilterBar.jsx';
import { MiniMonth } from './components/MiniMonth.jsx';
import { WeekGrid } from './components/WeekGrid.jsx';
import { useMeetings } from './hooks/useMeetings.js';
import { KINDS } from './lib/classify.js';
import {
  addDaysToKey,
  addMonthsToKey,
  dayKeyIn,
  daysUntilMonthEnd,
  daysUntilYearEnd,
  formatColumnHeading,
  formatDayHeading,
  isoWeekNumber,
  localDayStart,
  startOfMonthKey,
  startOfWeekKey,
  todayKeyIn,
  weekKeys,
  zoneAbbrev,
} from './lib/datetime.js';
import { matchesQuery } from './lib/search.js';
import './App.css';

const MOBILE_BREAKPOINT = 768;
const VIEW_MODES = new Set(['WEEK', 'AGENDA', 'DAY']);
const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_FORMAT_KEY = 'riscv-calendar-time-format';
const TIME_FORMATS = new Set(['24h', '12h']);

/**
 * Where a fresh search starts walking from.
 *
 * Searching forward begins just before the visible range so a match already
 * on screen is found first rather than skipped; searching backward begins
 * just after it, for the same reason in reverse.
 */
function searchOrigin(dayKeys, direction, timeZone) {
  if (direction > 0) {
    return { startMs: localDayStart(dayKeys[0], timeZone).getTime() - 1, id: null };
  }

  const afterLastDay = addDaysToKey(dayKeys[dayKeys.length - 1], 1);
  return { startMs: localDayStart(afterLastDay, timeZone).getTime(), id: null };
}

/** Total scheduled hours across a set of occurrences. */
function sumHours(list) {
  return list.reduce((sum, o) => sum + (o.end - o.start) / 3_600_000, 0);
}

/** Whole numbers stay whole; halves and quarters keep one decimal. */
function formatHours(hours) {
  const rounded = Math.round(hours * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function formatFetchedAt(timestamp, timeZone, timeFormat = '24h') {
  if (!timestamp) return 'unknown';
  const twelveHour = timeFormat === '12h';
  return new Intl.DateTimeFormat(twelveHour ? 'en-US' : 'en-GB', {
    timeZone,
    hour: twelveHour ? 'numeric' : '2-digit',
    minute: '2-digit',
    ...(twelveHour ? { hour12: true } : { hourCycle: 'h23' }),
  }).format(new Date(timestamp));
}

function emptyMeetingsMessage({ isDay, selectedDay, occurrences, activeKinds, query }) {
  const hasFilters = activeKinds.size > 0 || query.trim().length > 0;
  if (hasFilters) return 'No meetings match the current search or filters.';
  if (isDay) {
    return `No meetings on ${formatDayHeading(selectedDay)}. Enjoy the open day.`;
  }
  if (!occurrences.length) return 'No meetings in this week.';
  return 'No meetings to show.';
}

/** Hover only makes sense with a real pointer; touch gets the tap dialog. */
function hasHoverPointer() {
  try {
    return window.matchMedia('(hover: hover)').matches;
  } catch {
    return false;
  }
}

function resolveTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

function defaultViewMode() {
  return window.innerWidth < MOBILE_BREAKPOINT ? 'AGENDA' : 'WEEK';
}

function readTimeFormatPreference() {
  try {
    const value = localStorage.getItem(TIME_FORMAT_KEY);
    return TIME_FORMATS.has(value) ? value : '24h';
  } catch {
    return '24h';
  }
}

function validDayKey(value) {
  if (!DAY_KEY_RE.test(value ?? '')) return false;
  const dt = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(dt.getTime()) && dt.toISOString().slice(0, 10) === value;
}

function readInitialState() {
  const fallbackTimezone = resolveTimezone();
  const params = new URLSearchParams(window.location.search);
  const viewParam = params.get('view')?.toUpperCase();
  const dateParam = params.get('date');
  const date = validDayKey(dateParam) ? dateParam : todayKeyIn(fallbackTimezone);
  const query = params.get('q') ?? '';
  const kindSet = new Set(
    (params.get('kinds') ?? '')
      .split(',')
      .map((kind) => kind.trim())
      .filter((kind) => KINDS.includes(kind)),
  );

  return {
    timezone: params.get('tz') || fallbackTimezone,
    viewMode: VIEW_MODES.has(viewParam) ? viewParam : defaultViewMode(),
    viewPinned: VIEW_MODES.has(viewParam),
    weekStart: startOfWeekKey(date),
    selectedDay: date,
    monthAnchor: startOfMonthKey(date),
    query,
    activeKinds: kindSet,
    timeFormat: readTimeFormatPreference(),
  };
}

function App() {
  const [initialState] = useState(readInitialState);
  const [localTimezone] = useState(resolveTimezone);
  const [timezone, setTimezone] = useState(initialState.timezone);
  const [allTimezones] = useState(() =>
    Intl.supportedValuesOf ? Intl.supportedValuesOf('timeZone') : [],
  );

  // Viewport picks the default view, but an explicit choice wins from then on.
  const [viewMode, setViewMode] = useState(initialState.viewMode);
  const [viewPinned, setViewPinned] = useState(initialState.viewPinned);

  const [weekStart, setWeekStart] = useState(initialState.weekStart);
  const [selectedDay, setSelectedDay] = useState(initialState.selectedDay);
  const [monthAnchor, setMonthAnchor] = useState(initialState.monthAnchor);

  const [query, setQuery] = useState(initialState.query);
  const [activeKinds, setActiveKinds] = useState(initialState.activeKinds);
  const [timeFormat, setTimeFormat] = useState(initialState.timeFormat);
  const [selected, setSelected] = useState(null);
  const [searchCursor, setSearchCursor] = useState(null);
  const [highlightId, setHighlightId] = useState(null);
  const [searchNotice, setSearchNotice] = useState(null);
  const [hovered, setHovered] = useState(null);
  const hoverTimer = useRef(null);
  const calendarScrollRef = useRef(null);

  /**
   * Opening on a short delay keeps the card from flashing as the pointer
   * crosses the grid; closing on a delay lets the pointer travel into the card
   * to click Join without it vanishing underneath.
   */
  const handleHover = useCallback((occurrence, rect, laneClass = '') => {
    clearTimeout(hoverTimer.current);
    if (!occurrence) {
      hoverTimer.current = setTimeout(() => setHovered(null), 160);
      return;
    }
    if (!hasHoverPointer()) return;
    hoverTimer.current = setTimeout(
      () => setHovered({ occurrence, anchor: rect, laneClass }),
      260,
    );
  }, []);

  const handleSelect = useCallback((occurrence, laneClass = '') => {
    setHovered(null);
    setSelected({ occurrence, laneClass });
  }, []);

  const keepHover = useCallback(() => clearTimeout(hoverTimer.current), []);
  const dropHover = useCallback(() => {
    clearTimeout(hoverTimer.current);
    setHovered(null);
  }, []);

  useEffect(() => () => clearTimeout(hoverTimer.current), []);

  useEffect(() => {
    try {
      localStorage.setItem(TIME_FORMAT_KEY, timeFormat);
    } catch {
      // Preference persistence is best effort; the toggle still works in memory.
    }
  }, [timeFormat]);

  useEffect(() => {
    if (viewPinned) return undefined;
    const onResize = () =>
      setViewMode(window.innerWidth < MOBILE_BREAKPOINT ? 'AGENDA' : 'WEEK');
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [viewPinned]);

  const isDay = viewMode === 'DAY';
  const todayKey = todayKeyIn(timezone);

  const dayKeys = useMemo(
    () => (isDay ? [selectedDay] : weekKeys(weekStart)),
    [isDay, selectedDay, weekStart],
  );

  const {
    status,
    occurrences,
    error,
    stale,
    fetchedAt,
    refreshing,
    refreshNotice,
    reload,
    findMatch,
  } = useMeetings(dayKeys, timezone);

  const counts = useMemo(() => {
    const acc = {};
    for (const occ of occurrences) {
      for (const kind of occ.kinds) acc[kind] = (acc[kind] ?? 0) + 1;
    }
    return acc;
  }, [occurrences]);

  const filtered = useMemo(
    () =>
      occurrences.filter((occ) => {
        if (activeKinds.size && !occ.kinds.some((k) => activeKinds.has(k))) return false;
        return matchesQuery(occ.title, query);
      }),
    [occurrences, activeKinds, query],
  );

  const shownHours = useMemo(() => sumHours(filtered), [filtered]);
  const totalHours = useMemo(() => sumHours(occurrences), [occurrences]);
  const selectedOccurrence = selected
    ? occurrences.find((occ) => occ.id === selected.occurrence.id)
    : null;
  const activeKindParam = useMemo(
    () => KINDS.filter((kind) => activeKinds.has(kind)).join(','),
    [activeKinds],
  );

  const toggleKind = useCallback((kind) => {
    setActiveKinds((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
    setSearchCursor(null);
    setHighlightId(null);
    setSearchNotice(null);
  }, []);

  const clearKinds = useCallback(() => {
    setActiveKinds(new Set());
    setSearchCursor(null);
    setHighlightId(null);
    setSearchNotice(null);
  }, []);

  const resetFilters = useCallback(() => {
    setQuery('');
    setActiveKinds(new Set());
    setSearchCursor(null);
    setHighlightId(null);
    setSearchNotice(null);
  }, []);

  /**
   * Jump to the next or previous match anywhere in the calendar.
   *
   * The visible range only ever holds one week, so the plain filter can never
   * surface a meeting that is not already on screen. This walks the feed
   * outward from a cursor instead, moving the view to whatever it finds.
   */
  const jumpToMatch = useCallback(
    (direction) => {
      if (!query.trim()) return;
      const from = searchCursor ?? searchOrigin(dayKeys, direction, timezone);
      const match = findMatch({
        from,
        direction,
        predicate: (occ) =>
          (!activeKinds.size || occ.kinds.some((k) => activeKinds.has(k))) &&
          matchesQuery(occ.title, query),
      });

      if (!match) {
        const dir = direction > 0 ? 'later' : 'earlier';
        const filterNote = activeKinds.size ? ' with active filters' : '';
        setSearchNotice(`No ${dir} match for "${query.trim()}"${filterNote}`);
        return;
      }

      const key = dayKeyIn(match.start, timezone);
      setSearchCursor({ startMs: match.start.getTime(), id: match.id });
      setHighlightId(match.id);
      setSearchNotice(null);
      setWeekStart(startOfWeekKey(key));
      setMonthAnchor(startOfMonthKey(key));
      if (isDay) setSelectedDay(key);
    },
    [query, searchCursor, dayKeys, findMatch, activeKinds, timezone, isDay],
  );

  /** A new query restarts the walk from the visible range. */
  const handleQuery = useCallback((value) => {
    setQuery(value);
    setSearchCursor(null);
    setHighlightId(null);
    setSearchNotice(null);
  }, []);

  // The highlight is a "here it is" cue, not a persistent selection.
  useEffect(() => {
    if (!highlightId) return undefined;
    const id = setTimeout(() => setHighlightId(null), 4000);
    return () => clearTimeout(id);
  }, [highlightId]);

  useEffect(() => {
    if (!searchNotice) return undefined;
    const id = setTimeout(() => setSearchNotice(null), 2500);
    return () => clearTimeout(id);
  }, [searchNotice]);

  useEffect(() => {
    const params = new URLSearchParams();
    params.set('view', viewMode.toLowerCase());
    params.set('date', isDay ? selectedDay : weekStart);
    params.set('tz', timezone);
    if (query.trim()) params.set('q', query);
    if (activeKindParam) params.set('kinds', activeKindParam);

    const next = `${window.location.pathname}?${params.toString()}${window.location.hash}`;
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (next !== current) window.history.replaceState(null, '', next);
  }, [activeKindParam, isDay, query, selectedDay, timezone, viewMode, weekStart]);

  const resetCalendarScroll = useCallback(() => {
    if (calendarScrollRef.current) calendarScrollRef.current.scrollTop = 0;
  }, []);

  const chooseView = useCallback((mode) => {
    setViewMode(mode);
    setViewPinned(true);
    resetCalendarScroll();
  }, [resetCalendarScroll]);

  /** Picking a day in the mini calendar opens that day's agenda. */
  const pickDay = useCallback((key) => {
    resetCalendarScroll();
    setSelectedDay(key);
    setWeekStart(startOfWeekKey(key));
    setMonthAnchor(startOfMonthKey(key));
    setViewMode('DAY');
    setViewPinned(true);
  }, [resetCalendarScroll]);

  /** Step by a day or a week, depending on what is on screen. */
  const step = useCallback(
    (direction) => {
      if (isDay) {
        setSelectedDay((k) => {
          const next = addDaysToKey(k, direction);
          setWeekStart(startOfWeekKey(next));
          setMonthAnchor(startOfMonthKey(next));
          return next;
        });
      } else {
        setWeekStart((k) => {
          const next = addDaysToKey(k, direction * 7);
          setMonthAnchor(startOfMonthKey(next));
          return next;
        });
      }
    },
    [isDay],
  );

  const goToday = useCallback(() => {
    const key = todayKeyIn(timezone);
    setSelectedDay(key);
    setWeekStart(startOfWeekKey(key));
    setMonthAnchor(startOfMonthKey(key));
  }, [timezone]);

  const anchorKey = isDay ? selectedDay : weekStart;
  const rangeLabel = isDay
    ? formatDayHeading(selectedDay)
    : `${formatColumnHeading(dayKeys[0])} – ${formatColumnHeading(dayKeys[6])}`;
  const meetingCountLabel = filtered.length === occurrences.length
    ? String(occurrences.length)
    : `${filtered.length}/${occurrences.length}`;
  const meetingNoun = filtered.length === 1 && occurrences.length === 1 ? 'meeting' : 'meetings';
  const meetingScope = isDay ? 'today' : 'this week';
  const hoursLabel = formatHours(filtered.length === occurrences.length ? totalHours : shownHours);
  const feedTimeLabel = fetchedAt
    ? formatFetchedAt(fetchedAt, timezone, timeFormat)
    : 'not yet';
  const emptyMessage = emptyMeetingsMessage({
    isDay,
    selectedDay,
    occurrences,
    activeKinds,
    query,
  });

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="app-header-inner">
          <div className="brand">
            <a href="https://riscv.org" target="_blank" rel="noopener noreferrer">
              <img src={riscvLogo} alt="RISC-V Logo" className="logo" />
            </a>
            <h1>Technical Meetings</h1>
          </div>
          <div className="controls">
            <div className="feed-refresh" aria-live="polite">
              <span className="last-updated">
                <span title="LFX can take a few minutes to publish newly added or removed meetings.">
                  Last updated: <strong>{feedTimeLabel}</strong>
                </span>
              </span>
              {refreshNotice && (
                <span className={`refresh-result is-${refreshNotice.tone}`}>
                  {refreshNotice.message}
                </span>
              )}
              <button
                type="button"
                className={`refresh-button${refreshing ? ' is-refreshing' : ''}`}
                onClick={reload}
                disabled={refreshing}
                aria-label={refreshing ? 'Refreshing calendar feed' : 'Refresh calendar feed'}
                title={refreshing ? 'Refreshing calendar feed' : 'Refresh calendar feed'}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="16"
                  height="16"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path
                    d="M21 12a9 9 0 0 1-15.36 6.36L3 15.72M3 21v-5.28h5.28M3 12A9 9 0 0 1 18.36 5.64L21 8.28M21 3v5.28h-5.28"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
            <label className="tz-label" htmlFor="tz-select">
              Times in
              <span className="tz-abbrev">{zoneAbbrev(new Date(), timezone)}</span>
            </label>
            <div className="time-format-toggle" role="group" aria-label="Time format">
              {[
                ['24h', '24h'],
                ['12h', '12h'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={timeFormat === value ? 'is-active' : ''}
                  aria-pressed={timeFormat === value}
                  onClick={() => setTimeFormat(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            {timezone !== localTimezone && (
              <button
                type="button"
                className="local-tz-button"
                onClick={() => setTimezone(localTimezone)}
              >
                Use local
              </button>
            )}
            <select
              id="tz-select"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="timezone-select"
              aria-label="Select Timezone"
            >
              {allTimezones.map((tz) => (
                <option key={tz} value={tz}>
                  {tz.replace(/_/g, ' ')}
                </option>
              ))}
              {!allTimezones.includes(timezone) && <option value={timezone}>{timezone}</option>}
            </select>
          </div>
        </div>
      </header>

      <div className="controlbar">
        <div className="controlbar-inner">
          <div className="controlbar-main">
            <div className="week-nav">
              <button type="button" onClick={() => step(-1)} aria-label={isDay ? 'Previous day' : 'Previous week'}>‹</button>
              <button type="button" onClick={goToday}>Today</button>
              <button type="button" onClick={() => step(1)} aria-label={isDay ? 'Next day' : 'Next week'}>›</button>
              <span className="week-range">{rangeLabel}</span>
            </div>

            <div className="view-toggle" role="group" aria-label="Calendar view">
              {[
                ['WEEK', 'Week'],
                ['AGENDA', 'Agenda'],
                ['DAY', 'Day'],
              ].map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  className={viewMode === mode ? 'is-active' : ''}
                  aria-pressed={viewMode === mode}
                  onClick={() => chooseView(mode)}
                >
                  {label}
                </button>
              ))}
            </div>

            <FilterBar
              query={query}
              onQuery={handleQuery}
              activeKinds={activeKinds}
              onToggleKind={toggleKind}
              onClearKinds={clearKinds}
              onResetFilters={resetFilters}
              counts={counts}
              onFindNext={() => jumpToMatch(1)}
              onFindPrev={() => jumpToMatch(-1)}
              notice={searchNotice}
            />
          </div>

          <div className="stats-panel" aria-live="polite" aria-label="Calendar statistics">
            <span>W{isoWeekNumber(anchorKey)}</span>
            <span>{daysUntilYearEnd(todayKey)} days left in the year</span>
            <span>{daysUntilMonthEnd(todayKey)} days left in the month</span>
            <span>{meetingCountLabel} {meetingNoun} {meetingScope}</span>
            <span>{hoursLabel}h</span>
          </div>
        </div>
      </div>

      {stale && (
        <p className="notice notice-warn">
          Showing a cached copy — could not reach LFX just now.{' '}
          <button type="button" className="link-button" onClick={reload}>Retry</button>
        </p>
      )}

      <main className="calendar-container">
        <div className="calendar-layout">
          <aside className="sidebar">
            <MiniMonth
              anchorKey={monthAnchor}
              selectedKey={isDay ? selectedDay : null}
              todayKey={todayKey}
              weekKeysShown={isDay ? [] : dayKeys}
              onSelectDay={pickDay}
              onChangeMonth={(n) => setMonthAnchor((k) => addMonthsToKey(k, n))}
            />
            <nav className="sidebar-links" aria-label="RISC-V resources">
              <h2>Meeting Resources</h2>
              <a
                href="https://openprofile.dev/my-meetings/"
                target="_blank"
                rel="noopener noreferrer"
              >
                My Meetings (LFX)
              </a>
              <a
                href="https://openprofile.dev/"
                target="_blank"
                rel="noopener noreferrer"
              >
                Openprofile.dev
              </a>
              <a
                href="https://riscv.atlassian.net/wiki/spaces/HOME/pages/16154865/RISC-V+Technical+Meetings"
                target="_blank"
                rel="noopener noreferrer"
              >
                Meeting Guidelines
              </a>
              <a
                href="https://riscv.atlassian.net/wiki/spaces/HOME/pages/16154892/Meeting+Disclosures"
                target="_blank"
                rel="noopener noreferrer"
              >
                Disclosures
              </a>
              <a
                href="https://riscv.org/code-of-conduct/"
                target="_blank"
                rel="noopener noreferrer"
              >
                Code of Conduct
              </a>
              <h2>Reference</h2>
              <a
                href="https://riscv.github.io/adm-tc-dashboard/?committees"
                target="_blank"
                rel="noopener noreferrer"
              >
                Tech Committees Explorer
              </a>
              <a
                href="https://riscv.github.io/adm-spec-dashboard/"
                target="_blank"
                rel="noopener noreferrer"
              >
                Specification Development Dashboard
              </a>
              <a
                href="https://tech.riscv.org/members/"
                target="_blank"
                rel="noopener noreferrer"
              >
                RISC-V Members
              </a>
            </nav>
          </aside>

          <div className="calendar-scroll" ref={calendarScrollRef}>
            {status === 'loading' && <p className="empty-state">Loading meetings from LFX…</p>}

            {status === 'error' && (
              <div className="empty-state">
                <p>Could not load the calendar from LFX.</p>
                <p className="error-detail">{error?.message}</p>
                <button type="button" onClick={reload}>Try again</button>
              </div>
            )}

            {status === 'ready' &&
              (viewMode === 'WEEK' ? (
                <WeekGrid
                  dayKeys={dayKeys}
                  occurrences={filtered}
                  timeZone={timezone}
                  timeFormat={timeFormat}
                  onSelect={handleSelect}
                  onHover={handleHover}
                  highlightId={highlightId}
                  scrollContainerRef={calendarScrollRef}
                  focusDayKey={selectedDay}
                />
              ) : (
                <AgendaList
                  dayKeys={dayKeys}
                  occurrences={filtered}
                  timeZone={timezone}
                  timeFormat={timeFormat}
                  onSelect={handleSelect}
                  onHover={handleHover}
                  highlightId={highlightId}
                  emptyMessage={emptyMessage}
                />
              ))}
          </div>
        </div>
      </main>

      <footer className="app-footer">
        <div className="app-footer-inner">
          Source:{' '}
          <a
            href="https://webcal.prod.itx.linuxfoundation.org/lfx/a092M00001JV3GBQA1"
            target="_blank"
            rel="noopener noreferrer"
          >
            LFX calendar feed
          </a>
        </div>
      </footer>

      {hovered && !selectedOccurrence && (
        <EventHoverCard
          occurrence={hovered.occurrence}
          anchor={hovered.anchor}
          laneClass={hovered.laneClass}
          timeZone={timezone}
          timeFormat={timeFormat}
          onEnter={keepHover}
          onLeave={dropHover}
        />
      )}

      {selectedOccurrence && (
        <EventDetail
          occurrence={selectedOccurrence}
          laneClass={selected.laneClass}
          timeZone={timezone}
          timeFormat={timeFormat}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

export default App;
