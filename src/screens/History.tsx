import { useState } from 'react';
import { AppData } from '../lib/store';
import { Session } from '../types';
import { foldHistory, Group, insights } from '../engine/history';
import { blockLabel, blocks } from '../engine/gvt';

function SessionCard({ s }: { s: Session }) {
  return (
    <article className={`card ${s.status === 'skipped' ? 'skipped' : s.type === 'GVT' ? 'gvt-day' : 'complete'}`}>
      <div className="mv-head">
        <h3>{s.focus} · {s.swap ? 'Bodyweight swap' : s.type}</h3>
        <small>{new Date(s.date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</small>
      </div>
      {s.status === 'skipped' ? <p className="muted">Skipped</p> : s.movements.map((m) => (
        <p key={m.movementId} className="hist-line"><span>{m.name}</span>
          <span className="muted">{s.swap ? m.sets.map((x) => x.reps ?? 0).join(' + ')
            : s.type === 'GVT' ? blocks(m.sets).map(blockLabel).join(', ')
            : m.sets.filter((x) => x.done).map((x) => `${x.weight ?? '–'}×${x.reps ?? '–'}`).join('  ')}</span></p>
      ))}
      {s.gvtRepsPerMinute && <p className="muted">GVT: {s.gvtRepsPerMinute.reduce((a, b) => a + b, 0)} reps over {s.gvtRepsPerMinute.length} min</p>}
    </article>
  );
}

function Fold({ g, data, onInsights }: { g: Exclude<Group, { kind: 'day' }>; data: AppData; onInsights: (g: Exclude<Group, { kind: 'day' }>) => void }) {
  const [open, setOpen] = useState(false);
  const done = g.sessions.filter((s) => s.status === 'completed').length;
  return (
    <div className={`fold ${g.kind}`}>
      <button className="fold-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span>{open ? '▾' : '▸'} {g.label}</span><small>{done} session{done === 1 ? '' : 's'}</small>
      </button>
      {open && (
        <div className="fold-body">
          <button className="ghost wide" onClick={() => onInsights(g)}>Insights</button>
          {g.kind === 'month'
            ? g.weeks.map((w) => w.kind === 'week' && <Fold key={w.label} g={w} data={data} onInsights={onInsights} />)
            : [...g.sessions].sort((a, b) => b.date.localeCompare(a.date)).map((s) => <SessionCard key={s.id} s={s} />)}
        </div>
      )}
    </div>
  );
}

function InsightsModal({ g, data, onClose }: { g: Exclude<Group, { kind: 'day' }>; data: AppData; onClose: () => void }) {
  const weeks = Math.round((g.end.getTime() - g.start.getTime()) / (7 * 864e5));
  const i = insights(data.sessions, g.start, g.end, weeks, data.settings.summaryThreshold);
  return (
    <div className="sheet" onClick={onClose}>
      <div className="sheet-body" role="dialog" aria-label="Insights" onClick={(e) => e.stopPropagation()}>
        <h3>{g.label} insights</h3>
        <p className="hist-line"><span>Sessions</span><b>{i.completed} of {i.planned} planned</b></p>
        <p className="hist-line"><span>Total volume</span><b>{i.volumeKg.toLocaleString()} kg{i.prevVolumeKg != null ? ` (prev ${i.prevVolumeKg.toLocaleString()} kg)` : ''}</b></p>
        <h4>New PRs</h4>
        {i.prs.length ? i.prs.map((p) => <p key={p.name + p.kind} className="hist-line"><span>{p.name}</span><span>{p.kind === 'kg' ? 'Heaviest' : 'Est. 1RM'} {p.value} kg <small>(was {p.previous})</small></span></p>)
          : <p className="muted">None this period.</p>}
        <h4>Weight drops vs previous {g.kind}</h4>
        {i.drops.length ? i.drops.map((d) => <p key={d.name} className="hist-line"><span>{d.name}</span><span>{d.kg} kg <small>(was {d.previous})</small></span></p>)
          : <p className="muted">None.</p>}
        <button className="primary wide" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

export default function History({ data }: { data: AppData }) {
  const [view, setView] = useState<'sessions' | 'movement'>('sessions');
  const [mid, setMid] = useState('');
  const [modal, setModal] = useState<Exclude<Group, { kind: 'day' }> | null>(null);
  const sessions = [...data.sessions].reverse();
  const groups = foldHistory(data.sessions);
  const used = data.movements.filter((m) => data.sessions.some((s) => s.movements.some((x) => x.movementId === m.id)));

  return (
    <section>
      <header className="hero"><small>Back page</small><h1>History</h1>
        <div className="row">
          <button className={`chip ${view === 'sessions' ? 'on' : ''}`} onClick={() => setView('sessions')}>Sessions</button>
          <button className={`chip ${view === 'movement' ? 'on' : ''}`} onClick={() => setView('movement')}>By movement</button>
        </div>
      </header>
      {view === 'sessions' && (groups.length === 0 ? <p className="muted pad">No sessions yet.</p> : groups.map((g) =>
        g.kind === 'day' ? <SessionCard key={g.session.id} s={g.session} /> : <Fold key={g.label} g={g} data={data} onInsights={setModal} />))}
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
                <span>{s.type === 'GVT' ? blocks(m.sets).map(blockLabel).join(', ') : m.sets.filter((x) => x.done).map((x) => `${x.weight ?? '–'}×${x.reps ?? '–'}`).join('  ')}</span></p>
            );
          })}
        </>
      )}
      {modal && <InsightsModal g={modal} data={data} onClose={() => setModal(null)} />}
    </section>
  );
}
