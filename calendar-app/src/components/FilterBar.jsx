import { KINDS, kindFilterTitle } from '../lib/classify.js';

/**
 * Search box and one toggle per group kind.
 *
 * Renders as a fragment so it can sit on the same control row as the day
 * picker and view toggle rather than owning a bar of its own.
 *
 * No kind is selected by default: an empty selection means no narrowing, so
 * the default view is every meeting and picking a chip filters down to it.
 */
export function FilterBar({
  query,
  onQuery,
  activeKinds,
  onToggleKind,
  onClearKinds,
  onResetFilters,
  counts,
  onFindNext,
  onFindPrev,
  notice,
}) {
  const filtering = activeKinds.size > 0;
  const hasQuery = query.trim().length > 0;
  const activeKindLabel = KINDS.filter((kind) => activeKinds.has(kind)).join(', ');

  return (
    <>
      <div className="search-wrap">
        <input
          type="search"
          className="filter-search"
          placeholder="Search meetings…"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            (e.shiftKey ? onFindPrev : onFindNext)?.();
          }}
          aria-label="Search meetings by name. Press Enter to jump to the next match."
        />
        <span className="search-nav">
          <button
            type="button"
            onClick={onFindPrev}
            disabled={!hasQuery}
            title="Previous match (Shift+Enter)"
            aria-label="Go to previous match"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={onFindNext}
            disabled={!hasQuery}
            title="Next match (Enter)"
            aria-label="Go to next match"
          >
            ↓
          </button>
        </span>
        {notice && <span className="search-notice">{notice}</span>}
      </div>

      <div className="filter-kinds" role="group" aria-label="Filter by group type">
        {KINDS.map((kind) => {
          const active = activeKinds.has(kind);
          const count = counts[kind] ?? 0;
          const label = kindFilterTitle(kind);
          return (
            <button
              key={kind}
              type="button"
              className={`kind-chip${active ? ' is-active' : ''}`}
              aria-pressed={active}
              disabled={count === 0 && !active}
              title={active ? `Stop filtering by ${kind}` : label}
              aria-label={`${kind}: ${label}. ${count} meetings`}
              onClick={() => onToggleKind(kind)}
            >
              {kind}
              <span className="kind-count">{count}</span>
            </button>
          );
        })}
      </div>

      {filtering && (
        <span className="filter-active">
          <span>Filtered: {activeKindLabel}</span>
          <button type="button" onClick={onClearKinds}>
            Clear
          </button>
        </span>
      )}

      {(hasQuery || filtering) && (
        <button type="button" className="filter-reset" onClick={onResetFilters}>
          Reset filters
        </button>
      )}
    </>
  );
}
