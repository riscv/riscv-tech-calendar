/**
 * Turns a raw ICS SUMMARY into something displayable and filterable.
 *
 * LFX summaries carry bookkeeping the reader does not need — '(New)' markers
 * left over from a migration, '(LFX)' tags, and date stamps like '(20260805)'.
 * They also come in old/new pairs for the same group, so we need a normalised
 * key to collapse duplicates.
 */

export const KINDS = ['TG', 'SIG', 'HC', 'CSC', 'Other'];

/**
 * A meeting can legitimately be more than one kind — 'RV Joint Crypto SIG/TGs'
 * is both. Returning an array means a filter for either one finds it, instead
 * of forcing an arbitrary winner.
 *
 * Only the four working-group types get their own filter. Everything else —
 * Marketing, Events, Development Partners, one-off syncs — lands in Other.
 */
const KIND_RULES = [
  ['HC', /\bHCs?\b/i],
  ['TG', /\bTGs?\b/i],
  ['SIG', /\bSIGs?\b/i],
  ['CSC', /\bCSC\b|Certification Steering Committee/i],
];

// Trailing bookkeeping: '(New)', '(new)', '(LFX)', '(20260805)'.
const NOISE_SUFFIX = /\s*\((?:new|lfx|\d{6,8})\)\s*$/i;

// Org prefixes that vary between duplicate entries for the same group.
const ORG_PREFIX = /^(?:rv-lfx|risc-v-lfx|rv|risc-v)\s*[:-]?\s+/i;

/** Display title: strip trailing bookkeeping, collapse whitespace. Prefix kept. */
export function cleanTitle(summary) {
  return String(summary ?? '')
    .replace(NOISE_SUFFIX, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Aggressive slug used only to detect that two entries are the same group.
 * Collapses 'RV Floating Point SIG (New)' and 'RV-LFX Floating Point SIG'
 * to the same value.
 */
export function dedupKey(summary) {
  return cleanTitle(summary)
    .replace(ORG_PREFIX, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Which filter buckets this summary belongs to. Never empty. */
export function kindsOf(summary) {
  const s = String(summary ?? '');
  const found = KIND_RULES.filter(([, re]) => re.test(s)).map(([kind]) => kind);
  return found.length ? found : ['Other'];
}

export function classify(summary) {
  return {
    title: cleanTitle(summary),
    kinds: kindsOf(summary),
    key: dedupKey(summary),
  };
}
