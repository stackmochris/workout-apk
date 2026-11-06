import { useEffect, useRef, useState } from 'react';
import { sheetErrorMessage } from '../engine/sheetExport';
import { useAuth } from '../lib/auth';
import { exportWorkoutSheet, type WorkoutSheetExportResult } from '../lib/exportWorkoutSheet';
import type { BodyEntry, Session } from '../types';

type Phase = 'ask' | 'working' | 'result';

/**
 * Shown after a workout is already saved. Export uses the Settings path.
 * Not now, a failed export, and a closed prompt leave that workout in place.
 */
export default function FinishExportPrompt({
  sessions,
  body,
  onDismiss,
}: {
  sessions: Session[];
  body: BodyEntry[];
  onDismiss: () => void;
}) {
  const { user, ready } = useAuth();
  const [phase, setPhase] = useState<Phase>('ask');
  const [result, setResult] = useState<WorkoutSheetExportResult | null>(null);
  const live = useRef(true);
  const running = useRef(false);

  useEffect(() => () => { live.current = false; }, []);

  const accept = async () => {
    if (running.current) return;
    running.current = true;
    setPhase('working');
    let next: WorkoutSheetExportResult;
    try {
      next = await exportWorkoutSheet({ user, sessions, body });
    } catch (error) {
      next = { ok: false, message: sheetErrorMessage(error) };
    }
    if (!live.current) {
      running.current = false;
      return;
    }
    setResult(next);
    setPhase('result');
    running.current = false;
  };

  const title = phase === 'result'
    ? (result?.ok ? 'Exported to Google Sheet' : 'Google Sheet was not updated')
    : phase === 'working'
      ? 'Exporting to Google Sheet'
      : 'Export to Google Sheet?';

  return (
    <div
      className="sheet"
      role="dialog"
      aria-modal="true"
      aria-labelledby="finish-export-title"
      onClick={phase === 'result' ? undefined : onDismiss}
    >
      <div className="sheet-body" onClick={(e) => e.stopPropagation()}>
        <h3 id="finish-export-title">{title}</h3>
        {phase === 'ask' && (
          <p className="muted">This workout is saved. Export your sessions and body stats to your Google Sheet?</p>
        )}
        {phase === 'working' && (
          <p className="muted">Writing your sessions and body stats.</p>
        )}
        {phase === 'result' && result && (
          <>
            <p className="muted" role="status">{result.message}</p>
            {result.ok && (
              <p><a className="sheet-link" href={result.url} target="_blank" rel="noopener noreferrer">Open in Google Sheets</a></p>
            )}
          </>
        )}
        {phase === 'ask' && (
          <div className="row" style={{ marginTop: 16 }}>
            <button className="ghost" type="button" onClick={onDismiss}>Not now</button>
            <button className="primary" type="button" disabled={!ready} onClick={() => { void accept(); }}>Export</button>
          </div>
        )}
        {phase === 'working' && (
          <div className="row" style={{ marginTop: 16 }}>
            <button className="ghost" type="button" onClick={onDismiss}>Not now</button>
            <button className="primary" type="button" disabled>Exporting…</button>
          </div>
        )}
        {phase === 'result' && (
          <div className="row" style={{ marginTop: 16 }}>
            {result && !result.ok && <button className="ghost" type="button" onClick={() => { void accept(); }}>Try again</button>}
            <button className="primary" type="button" onClick={onDismiss}>Done</button>
          </div>
        )}
      </div>
    </div>
  );
}
