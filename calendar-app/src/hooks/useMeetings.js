import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchFeed } from '../lib/feed.js';
import { parseCalendar } from '../lib/ics.js';
import { expand } from '../lib/occurrences.js';
import { findMatchInOccurrences } from '../lib/occurrenceSearch.js';
import { dayKeyIn, windowForKeys } from '../lib/datetime.js';

const DAY_MS = 86_400_000;
// How far from the anchor a search index reaches, and how many times a
// fruitless search re-anchors before giving up. Bounded because several LFX
// series recur into the 2100s.
const HORIZON_DAYS = 400;
const MAX_EXTENSIONS = 1;
const AUTO_REFRESH_MS = 5 * 60 * 1000;
const OPPORTUNISTIC_REFRESH_COOLDOWN_MS = 15 * 1000;
const REFRESH_NOTICE_MS = 10 * 1000;

function buildIndex(events, anchor, direction) {
  const edge = new Date(anchor.getTime() + direction * HORIZON_DAYS * DAY_MS);
  const from = direction > 0 ? anchor : edge;
  const to = direction > 0 ? edge : new Date(anchor.getTime() + 1);
  return { events, from, to, list: expand(events, from, to) };
}

function indexContains(index, events, anchor) {
  return (
    index &&
    index.events === events &&
    anchor >= index.from &&
    anchor <= index.to
  );
}

function indexCoversSearch(index, events, anchor, direction) {
  const edge = new Date(anchor.getTime() + direction * HORIZON_DAYS * DAY_MS);
  return indexContains(index, events, anchor) && indexContains(index, events, edge);
}

function indexCoversRange(index, events, start, end) {
  return (
    index &&
    index.events === events &&
    start >= index.from &&
    end <= index.to
  );
}

function eventUidSet(events) {
  return new Set(events.map((event) => event.uid).filter(Boolean));
}

function diffSets(previous, next) {
  let added = 0;
  let removed = 0;
  for (const id of next) {
    if (!previous.has(id)) added += 1;
  }
  for (const id of previous) {
    if (!next.has(id)) removed += 1;
  }
  return { added, removed };
}

function refreshNoticeFor({ requestId, stale, previousText, nextText, previousUids, nextUids }) {
  if (requestId === 0) return null;
  if (stale) return { tone: 'warn', message: 'Refresh failed' };
  if (!previousText || previousText === nextText) {
    return { tone: 'neutral', message: 'No changes' };
  }

  const { added, removed } = diffSets(previousUids, nextUids);
  if (!added && !removed) return { tone: 'ok', message: 'Feed updated' };
  return { tone: 'ok', message: `Updated +${added} -${removed}` };
}

/**
 * Loads the LFX calendar once, then re-expands it as the user moves between
 * weeks or changes timezone.
 *
 * Fetching and parsing are the expensive steps and depend only on the feed, so
 * they happen once per page load. Expansion is cheap but window-dependent, so
 * it re-runs whenever the visible days or the zone change — a zone change can
 * genuinely move a meeting onto a different calendar day.
 */
export function useMeetings(dayKeys, timeZone) {
  const [events, setEvents] = useState(null);
  const [error, setError] = useState(null);
  const [stale, setStale] = useState(false);
  const [fromCache, setFromCache] = useState(false);
  const [fetchedAt, setFetchedAt] = useState(null);
  const [refreshNotice, setRefreshNotice] = useState(null);
  const [refreshRequest, setRefreshRequest] = useState({ id: 0, force: true });
  const [refreshingRequestId, setRefreshingRequestId] = useState(() => 0);
  const [searchIndex, setSearchIndex] = useState(null);
  const hasEventsRef = useRef(false);
  const lastFetchStartedRef = useRef(0);
  const feedTextRef = useRef(null);
  const feedUidsRef = useRef(new Set());

  useEffect(() => {
    hasEventsRef.current = Boolean(events);
  }, [events]);

  useEffect(() => {
    if (!refreshNotice) return undefined;
    const timer = setTimeout(() => setRefreshNotice(null), REFRESH_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [refreshNotice]);

  const requestForcedRefresh = useCallback((options = {}) => {
    if (
      options.respectCooldown &&
      Date.now() - lastFetchStartedRef.current < OPPORTUNISTIC_REFRESH_COOLDOWN_MS
    ) {
      return;
    }

    setSearchIndex(null);
    setRefreshRequest((request) => {
      const next = { id: request.id + 1, force: true };
      setRefreshingRequestId(next.id);
      return next;
    });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    const requestId = refreshRequest.id;
    lastFetchStartedRef.current = Date.now();

    fetchFeed({ signal: controller.signal, force: refreshRequest.force })
      .then((result) => {
        if (cancelled) return;
        const nextEvents = parseCalendar(result.text);
        const nextUids = eventUidSet(nextEvents);
        const notice = refreshNoticeFor({
          requestId,
          stale: Boolean(result.stale),
          previousText: feedTextRef.current,
          nextText: result.text,
          previousUids: feedUidsRef.current,
          nextUids,
        });

        setEvents(nextEvents);
        setSearchIndex(null);
        setStale(Boolean(result.stale));
        setFromCache(Boolean(result.fromCache));
        setFetchedAt(result.fetchedAt ?? null);
        setRefreshNotice(notice);
        setError(null);
        feedTextRef.current = result.text;
        feedUidsRef.current = nextUids;
      })
      .catch((err) => {
        if (cancelled || err.name === 'AbortError') return;
        if (hasEventsRef.current) {
          setStale(true);
          setError(null);
          setRefreshNotice({ tone: 'warn', message: 'Refresh failed' });
        } else {
          setError(err);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setRefreshingRequestId((id) => (id === requestId ? null : id));
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
      setRefreshingRequestId((id) => (id === requestId ? null : id));
    };
  }, [refreshRequest]);

  useEffect(() => {
    // Public ICS feeds do not push change notifications to the browser, so
    // combine a steady poll with opportunistic checks when the user returns
    // to the page after editing LFX elsewhere.
    const requestRefresh = () => {
      if (document.visibilityState === 'hidden') return;
      requestForcedRefresh();
    };
    const requestOpportunisticRefresh = () => {
      if (document.visibilityState === 'hidden') return;
      requestForcedRefresh({ respectCooldown: true });
    };

    const interval = setInterval(requestRefresh, AUTO_REFRESH_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') requestOpportunisticRefresh();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', requestOpportunisticRefresh);
    window.addEventListener('online', requestOpportunisticRefresh);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', requestOpportunisticRefresh);
      window.removeEventListener('online', requestOpportunisticRefresh);
    };
  }, [requestForcedRefresh]);

  /**
   * Lazily expands and caches a wide window around `anchor` for searching.
   *
   * Rebuilt only when the feed changes or the anchor leaves the cached span,
   * so walking through matches costs one expansion rather than one per step.
   */
  const ensureIndex = useCallback(
    (anchor, direction) => {
      if (!events) return [];
      if (indexCoversSearch(searchIndex, events, anchor, direction)) {
        return searchIndex.list;
      }

      const next = buildIndex(events, anchor, direction);
      setSearchIndex(next);
      return next.list;
    },
    [events, searchIndex],
  );

  /**
   * The meetings on the visible days.
   *
   * Served from the search cache when the visible range sits inside it, so a
   * next/previous match jump can render the destination week by filtering the
   * wide occurrence array rather than immediately re-expanding recurrence
   * rules. Ordinary paging still falls back to the narrow direct expansion.
   */
  const occurrences = useMemo(() => {
    if (!events || !dayKeys.length) return [];
    const { start, end } = windowForKeys(dayKeys);
    const visible = new Set(dayKeys);
    const source = indexCoversRange(searchIndex, events, start, end)
      ? searchIndex.list
      : expand(events, start, end);
    return source.filter((o) => visible.has(dayKeyIn(o.start, timeZone)));
  }, [events, dayKeys, timeZone, searchIndex]);

  /**
   * Scans beyond the visible window for the next (or previous) occurrence
   * satisfying `predicate`.
   *
   * The whole horizon is expanded in one pass and cached, rather than walked
   * in chunks. ICAL's iterator always starts at a series' DTSTART, so every
   * separate window re-pays the walk forward from 2024: measured, fifteen
   * 28-day chunks cost ~390 ms while a single 400-day expansion costs ~50 ms
   * for more occurrences. One build, then repeated next/prev are array scans.
   */
  const findMatch = useCallback(
    ({ predicate, from, direction = 1 }) => {
      if (!events) return null;

      const fromMs = from instanceof Date ? from.getTime() : from.startMs;
      if (!Number.isFinite(fromMs)) return null;

      for (let attempt = 0; attempt <= MAX_EXTENSIONS; attempt++) {
        // Re-anchor further out on each retry, so a match beyond the first
        // horizon is still reachable.
        const anchor = new Date(fromMs + direction * attempt * HORIZON_DAYS * DAY_MS);
        const index = ensureIndex(anchor, direction);
        const hit = findMatchInOccurrences(index, { predicate, from, direction });
        if (hit) return hit;
      }
      return null;
    },
    [events, ensureIndex],
  );

  const reload = useCallback(() => {
    try {
      sessionStorage.removeItem('lfx-ics-v1');
    } catch {
      // Nothing to clear; the refetch below is what matters.
    }
    requestForcedRefresh();
  }, [requestForcedRefresh]);

  const refreshing = refreshingRequestId === refreshRequest.id;

  let status = 'loading';
  if (error) status = 'error';
  else if (events) status = 'ready';

  return {
    status,
    occurrences,
    error,
    stale,
    fromCache,
    fetchedAt,
    refreshing,
    refreshNotice,
    reload,
    findMatch,
  };
}
