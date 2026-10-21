import { useMemo, useState } from 'react';
import { AppData, uid } from '../lib/store';
import { eveningWeights, liftSeries, movingAvg, muscleFatigue, trackedLifts, weeklyMuscleSets } from '../engine/analytics';
import { MUSCLES } from '../data/muscles';
import LineChart from '../components/LineChart';
import BodyMap from '../components/BodyMap';
import { parseKg } from '../lib/kg';
import { BodyEntry } from '../types';

type Props = { data: AppData; setData: React.Dispatch<React.SetStateAction<AppData>> };
type Metric = 'e1rm' | 'top' | 'volume';
const METRIC: Record<Metric, string> = { e1rm: 'Est. 1RM', top: 'Top set', volume: 'Volume' };

export default function Progress({ data, setData }: Props) {
  const lifts = useMemo(() => trackedLifts(data.sessions), [data.sessions]);
  const [lift, setLift] = useState<string>('');
  const [metric, setMetric] = useState<Metric>('e1rm');
  const id = lift || lifts[0]?.id || '';
  const series = useMemo(() => liftSeries(data.sessions, id), [data.sessions, id]);
  const weekly = useMemo(() => weeklyMuscleSets(data.sessions, data.movements), [data.sessions, data.movements]);
  const fatigue = useMemo(() => muscleFatigue(data.sessions, data.movements), [data.sessions, data.movements]);
  const target = data.settings.muscleTarget;
  const best = series.length ? Math.max(...series.map((p) => p.e1rm)) : null;

  return (
    <section>
      <header className="hero"><small>Trends</small><h1>Progress</h1></header>

      <div className="card">
        <h3>Lifts</h3>
        {lifts.length ? (
          <>
            <select aria-label="Lift" value={id} onChange={(e) => setLift(e.target.value)}>
              {lifts.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <div className="chips">
              {(Object.keys(METRIC) as Metric[]).map((m) => <button key={m} className={`chip ${metric === m ? 'on' : ''}`} onClick={() => setMetric(m)}>{METRIC[m]}</button>)}
            </div>
            <LineChart points={series.map((p) => ({ x: new Date(p.date).getTime(), y: p[metric] }))} unit="kg" />
            {best != null && <p className="muted">Best estimated 1RM {best} kg (Epley, warm-ups excluded)</p>}
          </>
        ) : <p className="muted">Log a weighted set to see charts.</p>}
      </div>

      <div className="card">
        <h3>Muscle load</h3>
        <p className="muted">Darker = worked harder recently. Fades as it recovers (about 36 h half-life, a rough guide).</p>
        <BodyMap load={fatigue} />
      </div>

      <div className="card">
        <h3>Sets this week</h3>
        <p className="muted">Hard sets per muscle (warm-ups excluded, secondary muscles count half) against {target} a week.</p>
        <div className="bars">
          {MUSCLES.map((m) => {
            const n = weekly[m.id] ?? 0;
            return (
              <div key={m.id} className="bar">
                <span>{m.label}</span>
                <div className="track"><i className={n >= target ? 'hit' : ''} style={{ width: `${Math.min(100, (n / target) * 100)}%` }} /></div>
                <b>{Math.round(n * 10) / 10}</b>
              </div>
            );
          })}
        </div>
      </div>

      <BodyStats data={data} setData={setData} />
    </section>
  );
}

function BodyStats({ data, setData }: Props) {
  const [w, setW] = useState('');
  const [bf, setBf] = useState('');
  const [waist, setWaist] = useState('');
  const evening = useMemo(() => eveningWeights(data.body), [data.body]);
  const trend = movingAvg(evening.map((e) => e.weight), 7);
  const series = (k: 'bodyFat' | 'waist') => data.body.filter((e) => e[k] != null).sort((a, b) => a.date.localeCompare(b.date)).map((e) => ({ x: new Date(e.date).getTime(), y: e[k]! }));
  const recent = [...data.body].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  const num = (v: string) => { const n = parseKg(v); return n == null ? undefined : n; };

  const add = () => {
    const entry: BodyEntry = { id: uid(), date: new Date().toISOString(), weight: num(w), bodyFat: num(bf), waist: num(waist), author: 'app', updatedAt: new Date().toISOString() };
    if (entry.weight == null && entry.bodyFat == null && entry.waist == null) return;
    setData((d) => ({ ...d, body: [...d.body, entry] }));
    setW(''); setBf(''); setWaist('');
  };

  return (
    <div className="card">
      <h3>Body</h3>
      <div className="body-form">
        <input inputMode="decimal" placeholder="Weight kg" aria-label="Weight kg" value={w} onChange={(e) => setW(e.target.value)} />
        <input inputMode="decimal" placeholder="Body fat %" aria-label="Body fat %" value={bf} onChange={(e) => setBf(e.target.value)} />
        <input inputMode="decimal" placeholder="Waist cm" aria-label="Waist cm" value={waist} onChange={(e) => setWaist(e.target.value)} />
        <button className="primary" onClick={add}>Log</button>
      </div>
      <h4>Weight, late-evening weigh-ins</h4>
      <p className="muted small">Only weigh-ins from 10pm to 3am count, so each point compares like with like. Line = 7-weigh-in average.</p>
      <LineChart points={evening.map((e) => ({ x: new Date(e.date).getTime(), y: e.weight }))} trend={trend} unit="kg" />
      {series('bodyFat').length > 0 && <><h4>Body fat %</h4><LineChart points={series('bodyFat')} unit="%" height={110} /></>}
      {series('waist').length > 0 && <><h4>Waist</h4><LineChart points={series('waist')} unit="cm" height={110} /></>}
      {recent.length > 0 && (
        <>
          <h4>Recent</h4>
          {recent.map((e) => (
            <p key={e.id} className="hist-line">
              <span>{new Date(e.date).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
              <span className="muted">{[e.weight != null && `${e.weight} kg`, e.bodyFat != null && `${e.bodyFat}%`, e.waist != null && `${e.waist} cm`].filter(Boolean).join(' · ')}</span>
            </p>
          ))}
        </>
      )}
    </div>
  );
}
