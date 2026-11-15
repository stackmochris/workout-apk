import { useEffect, useState } from 'react';
import { beep } from '../lib/audio';
import { alerts } from '../lib/alerts';

interface RestCue { endAt: number; seconds: number }

export default function RestTimer({ cue, onChange, sound, vibrate }: {
  cue?: RestCue;
  onChange: (cue?: RestCue) => void;
  sound: boolean;
  vibrate: boolean;
}) {
  const [, refresh] = useState(0);
  const endAt = cue?.endAt;
  useEffect(() => {
    if (endAt == null || endAt <= Date.now()) return;
    const label = 'Rest';
    alerts.running(endAt, label);
    const id = window.setInterval(() => {
      refresh((n) => n + 1);
      const left = Math.ceil((endAt - Date.now()) / 1000);
      if (left <= 0) {
        window.clearInterval(id);
        alerts.finished(label, { sound, vibrate });
      } else if (left <= 3 && sound) {
        beep('tick');
      }
    }, 1000);
    return () => { window.clearInterval(id); alerts.cancel(); };
  }, [endAt, sound, vibrate]);

  if (!cue) return null;
  const left = Math.max(0, Math.ceil((cue.endAt - Date.now()) / 1000));
  return (
    <div className="session-rest">
      <strong role="timer">{left ? `Rest ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : 'Ready for next set'}</strong>
      <button className="ghost" onClick={() => onChange({ endAt: Math.max(Date.now(), cue.endAt) + 15_000, seconds: cue.seconds + 15 })}>+15s</button>
      <button className="ghost" onClick={() => onChange()}>{left ? 'Skip rest' : 'Dismiss'}</button>
    </div>
  );
}
