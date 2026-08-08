import { useCallback, useEffect, useRef, useState } from 'react';
import { EventFacts } from './EventFacts.jsx';
import { meetingDetailsText } from '../lib/meetingDetails.js';

export function EventDetail({
  occurrence,
  timeZone,
  timeFormat = '24h',
  laneClass = '',
  onClose,
}) {
  const closeRef = useRef(null);
  const panelRef = useRef(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      if (e.key !== 'Tab') return;
      const focusables = [
        ...(panelRef.current?.querySelectorAll(
          'a[href], button:not(:disabled), select:not(:disabled), textarea:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])',
        ) ?? []),
      ].filter((el) => !el.hasAttribute('disabled') && el.offsetParent !== null);
      if (!focusables.length) return;

      const first = focusables[0];
      const last = focusables.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const copyDetails = useCallback(async () => {
    if (!occurrence) return;
    await navigator.clipboard.writeText(meetingDetailsText(occurrence, timeZone, timeFormat));
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }, [occurrence, timeFormat, timeZone]);

  if (!occurrence) return null;

  return (
    <div className="detail-backdrop" onClick={onClose} role="presentation">
      <div
        ref={panelRef}
        className={`detail-panel ${laneClass}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="detail-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="detail-head">
          <h2 id="detail-title">{occurrence.title}</h2>
          <button
            ref={closeRef}
            type="button"
            className="detail-close"
            onClick={onClose}
            aria-label="Close meeting details"
          >
            ×
          </button>
        </header>

        <EventFacts occurrence={occurrence} timeZone={timeZone} timeFormat={timeFormat} />

        <button type="button" className="detail-copy" onClick={copyDetails}>
          {copied ? 'Copied' : 'Copy details'}
        </button>

        {occurrence.joinUrl && (
          <a
            className="detail-join"
            href={occurrence.joinUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Join meeting ↗
          </a>
        )}
      </div>
    </div>
  );
}
