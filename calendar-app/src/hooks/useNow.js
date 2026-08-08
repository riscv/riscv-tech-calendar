import { useEffect, useState } from 'react';

const DEFAULT_INTERVAL_MS = 60_000;

/**
 * A Date that refreshes on an interval.
 *
 * Both calendar views need to know what has already happened — the week grid
 * to place its now-line and grey out finished meetings, the agenda to grey out
 * its rows. A minute is fine enough for both without re-rendering constantly.
 */
export function useNow(intervalMs = DEFAULT_INTERVAL_MS) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}
