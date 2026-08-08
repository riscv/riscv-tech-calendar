/**
 * Fetches the RISC-V International calendar from LFX.
 *
 * The feed is served with `access-control-allow-origin: *` and gzips to ~38 KB,
 * so the browser can read it directly — no proxy and no build-time snapshot.
 * LFX stays the single source of truth.
 */

export const FEED_URL =
  'https://webcal.prod.itx.linuxfoundation.org/lfx/a092M00001JV3GBQA1';

const CACHE_KEY = 'lfx-ics-v1';
const TTL_MS = 15 * 60 * 1000;

function readCache() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return typeof parsed?.text === 'string' ? parsed : null;
  } catch {
    // Private browsing, quota, or corrupt entry — behave as a cache miss.
    return null;
  }
}

function writeCache(entry) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch {
    // Cache is an optimisation; failing to persist must not break the page.
  }
}

/**
 * Returns the raw ICS text.
 *
 * Serves from cache inside the TTL. Otherwise revalidates with the feed's
 * ETag, so an unchanged calendar costs a 304 rather than a re-download. If the
 * network fails but we hold any cached copy, stale data beats a blank page —
 * the caller is told via `stale` so it can say so in the UI.
 */
export async function fetchFeed({ signal, url = FEED_URL, force = false } = {}) {
  const cached = readCache();
  const fresh = !force && cached && Date.now() - cached.fetchedAt < TTL_MS;
  if (fresh) return { text: cached.text, fromCache: true, fetchedAt: cached.fetchedAt };

  try {
    const res = await fetch(url, {
      signal,
      cache: force ? 'no-store' : 'default',
      headers: cached?.etag ? { 'If-None-Match': cached.etag } : undefined,
    });

    if (res.status === 304 && cached) {
      const entry = { ...cached, fetchedAt: Date.now() };
      writeCache(entry);
      return { text: entry.text, fromCache: true, fetchedAt: entry.fetchedAt };
    }

    if (!res.ok) throw new Error(`LFX feed returned HTTP ${res.status}`);

    const text = await res.text();
    if (!text.includes('BEGIN:VCALENDAR')) {
      throw new Error('LFX feed did not return an iCalendar document');
    }

    const entry = { text, etag: res.headers.get('ETag'), fetchedAt: Date.now() };
    writeCache(entry);
    return { text, fromCache: false, fetchedAt: entry.fetchedAt };
  } catch (err) {
    if (cached) {
      return {
        text: cached.text,
        fromCache: true,
        stale: true,
        fetchedAt: cached.fetchedAt,
        error: err,
      };
    }
    throw err;
  }
}
