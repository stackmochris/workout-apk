import { VERSION } from '../components/UpdateBanner';
import { useState } from 'react';
import { AppData, exportCsv, exportJson, freshData } from '../lib/store';
import { listSnapshots, parseBackup, readSnapshot } from '../lib/backup';
import { notificationsSupported, requestNotifications } from '../lib/alerts';
import { plateLabel, plateLoad } from '../engine/plates';
import { Theme, Goal } from '../types';
import type { CardioGoal } from '../types';

type Props = { data: AppData; setData: React.Dispatch<React.SetStateAction<AppData>> };

const THEMES: { id: Theme; label: string }[] = [
  { id: 'green', label: 'Green spectrum' },
  { id: 'red', label: 'Red spectrum' },
  { id: 'blue', label: 'Blue spectrum' },
  { id: 'gold', label: 'Gold spectrum' },
  { id: 'templar', label: 'Templar Cross' },
  { id: 'jerusalem', label: 'Jerusalem Cross' },
  { id: 'union-jack', label: 'Union Jack' },
  { id: 'confederate', label: 'Confederate Flag' },
  { id: 'pride', label: 'Pride Flag' },
];

const GOALS: { id: Goal; label: string }[] = [
  { id: 'strength', label: 'Strength' },
  { id: 'hypertrophy', label: 'Hypertrophy' },
  { id: 'endurance', label: 'Endurance' },
  { id: 'mixed', label: 'Mixed (use defaults)' },
];

export default function SettingsScreen({ data, setData }: Props) {
  const s = data.settings;
  const set = (patch: Partial<typeof s>) => setData((d) => ({ ...d, settings: { ...d.settings, ...patch } }));
  const num = (v: string, f: number) => (Number.isFinite(Number(v)) && v !== '' ? Number(v) : f);
  const [plateText, setPlateText] = useState(s.plates.join(', '));
  const [snaps, setSnaps] = useState(listSnapshots);
  const [msg, setMsg] = useState('');

  const restore = (next: AppData, what: string) => {
    if (!confirm(`Replace everything on this device with ${what} (${next.sessions.length} sessions, ${next.body.length} body entries)? Export first if you want a copy of the current data.`)) return;
    setData(next);
    setMsg(`Restored ${what}.`);
    setSnaps(listSnapshots());
  };
  const importFile = async (f: File | undefined) => {
    if (!f) return;
    try { restore(parseBackup(await f.text()), f.name); } catch { setMsg('That file is not a workout backup.'); }
  };

  const toggleWatch = (item: string) => {
    const watch = s.frequency.watch.includes(item)
      ? s.frequency.watch.filter((x) => x !== item)
      : [...s.frequency.watch, item];
    set({ frequency: { ...s.frequency, watch } });
  };

  return (
    <section>
      <header className="hero"><small>Preferences</small><h1>Settings</h1></header>
      <div className="card form">
        
      <div className="card form">
        <h3>Your name</h3>
        <p className="muted">Stored on this phone. Firebase is only needed when others need to see it.</p>
        <label>Name
          <input value={s.displayName ?? ''} onChange={(e) => set({ displayName: e.target.value })} placeholder="e.g. Chris" />
        </label>
      </div>

        <h3>Visual customization</h3>
        <p className="muted small">Hero background packs</p>
        <div className="chips">
          {THEMES.map((t) => (
            <button key={t.id} className={`chip ${s.theme === t.id ? 'on' : ''}`} onClick={() => set({ theme: t.id })}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="card form">
        <h3>Training goal</h3>
        <p className="muted small">Drives the set/rep sub-heading on each movement. Tap a movement's sub-heading on Today to override it for you.</p>
        <div className="chips">
          {GOALS.map((g) => (
            <button key={g.id} className={`chip ${s.goal === g.id ? 'on' : ''}`} onClick={() => set({ goal: g.id })}>
              {g.label}
            </button>
          ))}
        </div>
      </div>
      <div className="card form">
        
      <div className="card form">
        <h3>Cardio priority</h3>
        <p className="muted">What the cardio cards should emphasise.</p>
        <div className="chips">
          {([['maintenance','Maintenance'],['calories','Calorie burn'],['pace','Pace'],['distance','Distance'],['time','Time']] as [CardioGoal, string][]).map(([id, label]) => (
            <button key={id} className={`chip ${s.cardioGoal === id ? 'on' : ''}`} onClick={() => set({ cardioGoal: id })}>{label}</button>
          ))}
        </div>
      </div>

        <h3>Timers</h3>
        <label>Rest (seconds)<input inputMode="numeric" value={s.restSeconds} onChange={(e) => set({ restSeconds: num(e.target.value, 90) })} /></label>
        <label>GVT sets<input inputMode="numeric" value={s.gvt.sets} onChange={(e) => set({ gvt: { ...s.gvt, sets: num(e.target.value, 10) } })} /></label>
        <label>GVT reps per set<input inputMode="numeric" value={s.gvt.reps} onChange={(e) => set({ gvt: { ...s.gvt, reps: num(e.target.value, 10) } })} /></label>
        <label>GVT seconds per set<input inputMode="numeric" value={s.gvt.seconds} onChange={(e) => set({ gvt: { ...s.gvt, seconds: num(e.target.value, 60) } })} /></label>
        <label className="toggle">Sound<input type="checkbox" checked={s.sound} onChange={(e) => set({ sound: e.target.checked })} /></label>
        <label>Superset hop (seconds)<input inputMode="numeric" value={s.supersetRest} onChange={(e) => set({ supersetRest: num(e.target.value, 15) })} /></label>
        {notificationsSupported() && (
          <label className="toggle">Timer notifications<input type="checkbox" checked={s.notifications} onChange={async (e) => {
            const on = e.target.checked && (await requestNotifications());
            set({ notifications: on });
            if (e.target.checked && !on) setMsg('Notifications are blocked for this site in the browser settings.');
          }} /></label>
        )}
        <label className="toggle">Vibration<input type="checkbox" checked={s.vibrate} onChange={(e) => set({ vibrate: e.target.checked })} /></label>
      </div>
      <div className="card form">
        <h3>Frequency / intensity hints</h3>
        <label className="toggle">Enable hints<input type="checkbox" checked={s.frequency.enabled} onChange={(e) => set({ frequency: { ...s.frequency, enabled: e.target.checked } })} /></label>
        <label>Warn after N hits this week<input inputMode="numeric" value={s.frequency.threshold} onChange={(e) => set({ frequency: { ...s.frequency, threshold: num(e.target.value, 3) } })} /></label>
        <p className="muted small">Watch groups</p>
        <div className="chips">
          {['Chest', 'Shoulder', 'Back', 'Arm', 'Leg', 'push', 'pull'].map((g) => (
            <button key={g} className={`chip ${s.frequency.watch.includes(g) ? 'on' : ''}`} onClick={() => toggleWatch(g)}>{g}</button>
          ))}
        </div>
      </div>
      <div className="card form">
        <h3>Missed-week penalty</h3>
        <p className="muted">Applies when last week had fewer than {s.summaryThreshold} completed sessions (swaps count). Amounts not final yet.</p>
        <label>Barbell (+kg)<input inputMode="decimal" value={s.penalty.barbellKg} onChange={(e) => set({ penalty: { ...s.penalty, barbellKg: num(e.target.value, 2.5) } })} /></label>
        <label>Dumbbell / cable (+kg)<input inputMode="decimal" value={s.penalty.dumbbellCableKg} onChange={(e) => set({ penalty: { ...s.penalty, dumbbellCableKg: num(e.target.value, 1) } })} /></label>
        <label>Elbow-flagged (+reps)<input inputMode="numeric" value={s.penalty.elbowReps} onChange={(e) => set({ penalty: { ...s.penalty, elbowReps: num(e.target.value, 2) } })} /></label>
        <label className="toggle">Stack across consecutive missed weeks<input type="checkbox" checked={s.penalty.stack} onChange={(e) => set({ penalty: { ...s.penalty, stack: e.target.checked } })} /></label>
      </div>
      <div className="card form">
        <h3>Plates and targets</h3>
        <label>Bar (kg)<input inputMode="decimal" value={s.barKg} onChange={(e) => set({ barKg: num(e.target.value, 20) })} /></label>
        <label>Plates (kg, comma separated)<input inputMode="decimal" value={plateText} onChange={(e) => {
          setPlateText(e.target.value);
          const ps = e.target.value.split(/[,\s]+/).map(Number).filter((n) => n > 0);
          if (ps.length) set({ plates: ps });
        }} /></label>
        <p className="muted small">Example: 100 kg = {plateLabel(plateLoad(100, s.barKg, s.plates))}</p>
        <label>Weekly sets per muscle<input inputMode="numeric" value={s.muscleTarget} onChange={(e) => set({ muscleTarget: num(e.target.value, 10) })} /></label>
      </div>
      <div className="card form">
        <h3>Rotation</h3>
        <p className="muted">Counters: {Object.entries(data.rotation.counters).map(([f, c]) => `${f} ${c + 1}/3`).join(' \u00b7 ')}</p>
      </div>
      <div className="card form">
        <h3>Data</h3>
        <p className="muted">{data.sessions.length} sessions \u00b7 {data.movements.length} movements \u00b7 stored on this device</p>
        <button className="primary wide" onClick={() => exportJson(data)}>Export JSON (full backup)</button>
        <button className="ghost wide" onClick={() => exportCsv(data)}>Export CSV (sets and body stats)</button>
        <label className="ghost wide file">Restore from JSON file<input type="file" accept="application/json,.json" onChange={(e) => { void importFile(e.target.files?.[0]); e.target.value = ''; }} /></label>
        {msg && <p className="muted small">{msg}</p>}
        <h4>Automatic backups</h4>
        <p className="muted small">A copy is saved on this device once a day, last 7 days kept.</p>
        {snaps.length ? snaps.map((sn) => (
          <p key={sn.key} className="hist-line">
            <span>{sn.day} \u00b7 {sn.sessions} sessions</span>
            <button className="ghost" onClick={() => { const d = readSnapshot(sn.key); if (d) restore(d, `the ${sn.day} backup`); }}>Restore</button>
          </p>
        )) : <p className="muted small">None yet. The first one is saved after you log something.</p>}
        <button className="ghost wide" onClick={() => { if (confirm('Erase all local data on this device? Export first if you want a copy.')) setData(freshData()); }}>Reset all data</button>
      </div>
      <p className="version">Workout Tracker {VERSION}</p>
    </section>
  );
}
