import { useEffect, useRef, useState } from 'react';
import { beep } from '../lib/audio';
import { alerts } from '../lib/alerts';

export interface RestCue { n: number; seconds: number; label?: string }

/** Rest countdown. A new cue (n changes) restarts it; it starts by itself when a set is ticked. */
export default function RestTimer({ cue, sound, vibrate }: { cue: RestCue; sound: boolean; vibrate: boolean }) {
  const [left, setLeft] = useState<number | null>(null);
  const endAt = useRef(0);
  const label = cue.label ?? 'Rest';

  useEffect(() => {
    if (cue.n > 0) {
      endAt.current = Date.now() + cue.seconds * 1000;
      setLeft(cue.seconds);
      alerts.running(endAt.current, label);
    }
  }, [cue.n]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (left == null) return;
    const id = setInterval(() => {
      const l = Math.max(0, Math.ceil((endAt.current - Date.now()) / 1000));
      setLeft(l);
      if (l > 0 && l <= 3 && sound) beep('tick');
      if (l === 0) {
        clearInterval(id);
        alerts.finished(label, { sound, vibrate });
        setTimeout(() => setLeft(null), 1500);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [left == null, cue.n]); // eslint-disable-line react-hooks/exhaustive-deps

  if (left == null) return null;
  const mm = Math.floor(left / 60);
  const ss = String(left % 60).padStart(2, '0');
  return (
    <div className={`rest ${left <= 10 ? 'warn' : ''} ${left === 0 ? 'go' : ''}`}>
      <span>{label}</span>
      <strong>{left === 0 ? 'Go' : `${mm}:${ss}`}</strong>
      <button onClick={() => { endAt.current += 15000; setLeft((l) => (l ?? 0) + 15); alerts.running(endAt.current, label); }}>+15s</button>
      <button onClick={() => { setLeft(null); alerts.cancel(); }}>Skip</button>
    </div>
  );
}
