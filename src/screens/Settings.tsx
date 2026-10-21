import { AppData, exportJson, freshData } from '../lib/store';

type Props = { data: AppData; setData: React.Dispatch<React.SetStateAction<AppData>> };

export default function SettingsScreen({ data, setData }: Props) {
  const s = data.settings;
  const set = (patch: Partial<typeof s>) => setData((d) => ({ ...d, settings: { ...d.settings, ...patch } }));
  const num = (v: string, f: number) => (Number.isFinite(Number(v)) && v !== '' ? Number(v) : f);

  return (
    <section>
      <header className="hero"><small>Preferences</small><h1>Settings</h1></header>
      <div className="card form">
        <h3>Timers</h3>
        <label>Rest (seconds)<input inputMode="numeric" value={s.restSeconds} onChange={(e) => set({ restSeconds: num(e.target.value, 90) })} /></label>
        <label>GVT sets<input inputMode="numeric" value={s.gvt.sets} onChange={(e) => set({ gvt: { ...s.gvt, sets: num(e.target.value, 10) } })} /></label>
        <label>GVT reps per set<input inputMode="numeric" value={s.gvt.reps} onChange={(e) => set({ gvt: { ...s.gvt, reps: num(e.target.value, 10) } })} /></label>
        <label>GVT seconds per set<input inputMode="numeric" value={s.gvt.seconds} onChange={(e) => set({ gvt: { ...s.gvt, seconds: num(e.target.value, 60) } })} /></label>
        <label className="toggle">Sound<input type="checkbox" checked={s.sound} onChange={(e) => set({ sound: e.target.checked })} /></label>
        <label className="toggle">Vibration<input type="checkbox" checked={s.vibrate} onChange={(e) => set({ vibrate: e.target.checked })} /></label>
      </div>
      <div className="card form">
        <h3>Rotation</h3>
        <p className="muted">Counters: {Object.entries(data.rotation.counters).map(([f, c]) => `${f} ${c + 1}/3`).join(' · ')}</p>
      </div>
      <div className="card form">
        <h3>Data</h3>
        <p className="muted">{data.sessions.length} sessions · {data.movements.length} movements · stored on this device</p>
        <button className="primary wide" onClick={() => exportJson(data)}>Export JSON</button>
        <button className="ghost wide" onClick={() => { if (confirm('Erase all local data on this device? Export first if you want a copy.')) setData(freshData()); }}>Reset all data</button>
        <p className="muted">Movement library editor, rep ranges, injury flags, targets and restore arrive in M3.</p>
      </div>
    </section>
  );
}
