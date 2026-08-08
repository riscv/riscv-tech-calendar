function cursorFrom(value) {
  if (value instanceof Date) return { startMs: value.getTime(), id: null };
  return {
    startMs:
      value?.startMs ??
      (value?.start instanceof Date ? value.start.getTime() : value?.start?.getTime?.()),
    id: value?.id ?? null,
  };
}

/**
 * Finds the next or previous matching occurrence in an already-sorted list.
 *
 * The cursor carries both timestamp and id so simultaneous matches are stepped
 * through one at a time instead of being skipped as a block.
 */
export function findMatchInOccurrences(occurrences, { predicate, from, direction = 1 }) {
  const cursor = cursorFrom(from);
  if (!Number.isFinite(cursor.startMs)) return null;

  const matches = occurrences.filter(predicate);
  const step = direction > 0 ? 1 : -1;

  if (cursor.id) {
    const index = matches.findIndex((o) => o.id === cursor.id);
    if (index !== -1) return matches[index + step] ?? null;
  }

  if (direction > 0) {
    return matches.find((o) => o.start.getTime() > cursor.startMs) ?? null;
  }

  for (let i = matches.length - 1; i >= 0; i -= 1) {
    const occurrence = matches[i];
    if (occurrence.start.getTime() < cursor.startMs) return occurrence;
  }

  return null;
}
