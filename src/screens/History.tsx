import { useState } from 'react';
import { AppData } from '../lib/store';

export default function History({ data }: { data: AppData }) {
  const [view, setView] = useState<'sessions' | 'movement'>('sessions');
  const [mid, setMid] = useState('');
  const sessions = [...data.sessions].reverse();
  const used = data.movements.filter((m) => data.sessions.some((s) => s.movements.some((x) => x.movementId === m.id)));

  return (
    <section>
      <header className="hero"><small>Back page</small><h1>History</h1>
        <div className="row">
          <button className={`chip ${view === 'sessions' ? 'on' : ''}`} onClick={() => setView('sessions')}>Sessions</button>
          <button className={`chip ${view === 'movement' ? 'on' : ''}`} onClick={() => setView('movement')}>By movement</button>
        </div>
      </header>
      {view === 'sessions' && (sessions.length === 0 ? <p className="muted pad">No sessions yet.</p> : sessions.map((s) => (
        <article key={s.id} className={`card ${s.status === 'skipped' ? 'skipped' : s.type === 'GVT' ? 'gvt-day' : 'complete'}`}>
          <div className="mv-head">
            <h3>{s.focus} · {s.type}</h3>
            <small>{new Date(s.date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</small>
          </div>
          {s.status === 'skipped' ? <p className="muted">Skipped</p> : s.movements.map((m) => (
            <p key={m.movementId} className="hist-line"><span>{m.name}</span>
              <span className="muted">{s.gvtRepsPerMinute ? '' : m.sets.filter((x) => x.done).map((x) => `${x.weight ?? '–'}×${x.reps ?? '–'}`).join('  ')}</span></p>
          ))}
          {s.gvtRepsPerMinute && <p className="muted">GVT: {s.gvtRepsPerMinute.reduce((a, b) => a + b, 0)} reps over {s.gvtRepsPerMinute.length} min</p>}
        </article>
      )))}
      {view === 'movement' && (
        <>
          <select className="search wide" value={mid} onChange={(e) => setMid(e.target.value)}>
            <option value="">Choose a movement</option>
            {used.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          {mid && sessions.filter((s) => s.movements.some((x) => x.movementId === mid)).map((s) => {
            const m = s.movements.find((x) => x.movementId === mid)!;
            return (
              <p key={s.id} className="card hist-line"><span>{new Date(s.date).toLocaleDateString()}</span>
                <span>{m.sets.filter((x) => x.done).map((x) => `${x.weight ?? '–'}×${x.reps ?? '–'}`).join('  ')}</span></p>
            );
          })}
        </>
      )}
    </section>
  );
}
