import { useLayoutEffect, useRef, useState } from 'react';
import { EventFacts } from './EventFacts.jsx';
import { meetingDetailsText } from '../lib/meetingDetails.js';

const GAP = 10;
const MARGIN = 8;

/**
 * Preview of a meeting shown on hover, with the same content as the dialog.
 *
 * Rendered at app level rather than inside a cell so it is never clipped by
 * the calendar's scroll container, and positioned after mount once its real
 * size is known.
 */
export function EventHoverCard({
  occurrence,
  timeZone,
  timeFormat = '24h',
  anchor,
  laneClass = '',
  onEnter,
  onLeave,
}) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  const [copied, setCopied] = useState(false);

  useLayoutEffect(() => {
    const card = ref.current;
    if (!card || !anchor) return;
    const { width, height } = card.getBoundingClientRect();

    // Prefer the right of the anchor, flip left when that would overflow.
    let left = anchor.right + GAP;
    if (left + width > window.innerWidth - MARGIN) left = anchor.left - width - GAP;
    left = Math.max(MARGIN, Math.min(left, window.innerWidth - width - MARGIN));

    // Vertically centre on the anchor, clamped into view.
    let top = anchor.top + anchor.height / 2 - height / 2;
    top = Math.max(MARGIN, Math.min(top, window.innerHeight - height - MARGIN));

    setPos({ left, top });
  }, [anchor, occurrence]);

  if (!occurrence || !anchor) return null;

  const copyDetails = async () => {
    await navigator.clipboard.writeText(meetingDetailsText(occurrence, timeZone, timeFormat));
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div
      ref={ref}
      className={`hovercard ${laneClass}`}
      role="tooltip"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      style={{
        left: pos?.left ?? -9999,
        top: pos?.top ?? -9999,
        visibility: pos ? 'visible' : 'hidden',
      }}
    >
      <h3 className="hovercard-title">{occurrence.title}</h3>
      <EventFacts occurrence={occurrence} timeZone={timeZone} timeFormat={timeFormat} />
      <button type="button" className="hovercard-copy" onClick={copyDetails}>
        {copied ? 'Copied' : 'Copy details'}
      </button>
      {occurrence.joinUrl && (
        <a
          className="hovercard-join"
          href={occurrence.joinUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Join meeting ↗
        </a>
      )}
    </div>
  );
}
