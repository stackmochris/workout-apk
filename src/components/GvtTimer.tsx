import { useEffect, useRef, useState } from 'react';
import { beep, buzz, wakeLock } from '../lib/audio';

const R = 108;
const CIRC = 2 * Math.PI * R;

/**
 * Port of set_timer.html: 5s get-ready countdown, countdown ring per set, colour warnings
 * at 20s and 10s remaining, set dots, per-set rep counter, start/tick/done tones, wake lock.
 */
export default function GvtTimer({ sets, reps, seconds, sound, vibrate, onFinish }: {
  sets: number; reps: number; seconds: number; sound: boolean; vibrate: boolean;
  onFinish: (repsPerMinute: number[]) => void;
}) {
  const [phase, setPhase] = useState<'idle' | 'ready' | 'run' | 'paused' | 'done'>('idle');
  const [count, setCount] = useState(5);
  const [set, setSet] = useState(0);
  const [left, setLeft] = useState(seconds);
  const [log, setLog] = useState<number[]>([]);
  const release = useRef<() => void>(() => {});
  const tone = (t: Parameters<typeof beep>[0]) => sound && beep(t);

  // Get-ready countdown
  useEffect(() => {
    if (phase !== 'ready') return;
    if (count <= 0) { startSet(1); return; }
    tone('countdown');
    const id = setTimeout(() => setCount((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [phase, count]); // eslint-disable-line react-hooks/exhaustive-deps

  // Per-set countdown
  useEffect(() => {
    if (phase !== 'run') return;
    if (left <= 0) {
      setLog((g) => [...g, reps]);
      if (set >= sets) finish();
      else startSet(set + 1);
      return;
    }
    if (left <= 4 && left < seconds) tone('tick');
    const id = setTimeout(() => setLeft((l) => l - 1), 1000);
    return () => clearTimeout(id);
  }, [phase, left]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => release.current(), []);

  function startSet(n: number) {
    setSet(n);
    setLeft(seconds);
    setPhase('run');
    tone('start');
    if (vibrate) buzz(150);
  }
  function finish() {
    setPhase('done');
    tone('done');
    if (vibrate) buzz([300, 100, 300]);
    release.current();
  }
  async function toggle() {
    if (phase === 'idle' || phase === 'done') {
      setLog([]); setSet(0); setCount(5); setPhase('ready');
      release.current = await wakeLock();
    } else if (phase === 'run') setPhase('paused');
    else if (phase === 'paused') setPhase('run');
  }
  function reset() {
    setPhase('idle'); setSet(0); setLeft(seconds); setLog([]); release.current();
  }
  function adjustReps(i: number, d: number) {
    setLog((g) => g.map((r, j) => (j === i ? Math.max(0, r + d) : r)));
  }

  const warn = left <= 10 ? 'red' : left <= 20 ? 'orange' : '';
  const offset = phase === 'run' || phase === 'paused' ? CIRC * (1 - left / seconds) : 0;
  const total = log.reduce((a, b) => a + b, 0);

  return (
    <div className="gvt">
      <div className="dots">
        {Array.from({ length: sets }, (_, i) => (
          <i key={i} className={i < log.length ? 'done' : i === set - 1 && phase !== 'done' ? 'cur' : ''} />
        ))}
      </div>
      <svg viewBox="0 0 240 240" className="ring">
        <circle cx="120" cy="120" r={R} className="bg" />
        <circle cx="120" cy="120" r={R} className={`fill ${warn}`} strokeDasharray={CIRC} strokeDashoffset={offset} />
        <text x="120" y="112" className={`t ${phase === 'run' ? warn : ''}`}>
          {phase === 'ready' ? count : phase === 'done' ? '✓' : left}
        </text>
        <text x="120" y="150" className="s">
          {phase === 'idle' ? `${sets} × ${reps} @ ${seconds}s` : phase === 'ready' ? 'GET READY' : phase === 'done' ? `${total} reps` : `SET ${set} / ${sets}`}
        </text>
      </svg>
      <div className="row">
        <button className="primary" onClick={toggle}>{phase === 'run' ? 'Pause' : phase === 'paused' ? 'Resume' : phase === 'done' ? 'Restart' : 'Start'}</button>
        <button onClick={reset}>Reset</button>
      </div>
      {log.length > 0 && (
        <div className="replog">
          {log.map((r, i) => (
            <span key={i}>
              <button onClick={() => adjustReps(i, -1)}>−</button>
              <b>{r}</b>
              <button onClick={() => adjustReps(i, 1)}>+</button>
            </span>
          ))}
        </div>
      )}
      {phase === 'done' && <button className="primary wide" onClick={() => onFinish(log)}>Save GVT session</button>}
    </div>
  );
}
