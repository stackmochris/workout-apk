import { useState } from 'react';
import { AppData } from '../lib/store';
import { Session } from '../types';
import { foldHistory, Group } from '../engine/history';
import { buildReport } from '../engine/report';
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
          <span className="muted nums">{cardioLine(m) ?? (s.swap ? m.sets.map((x) => x.reps ?? 0).join(' + ')
            : s.type === 'GVT' ? blocks(m.sets).map(blockLabel).join(', ')
            : m.sets.filter((x) => x.done).map((x) => `${x.kind && x.kind !== 'working' ? `${x.kind[0].toUpperCase()} ` : ''}${x.weight ?? '–'}×${x.reps ?? '–'}`).join('  '))}</span></p>
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

const sign = (n: number, d = 1) => `${n > 0 ? '+' : ''}${Number(n.toFixed(d))}`;

function InsightsModal({ g, data, onClose }: { g: Exclude<Group, { kind: 'day' }>; data: AppData; onClose: () => void }) {
  const r = buildReport(data.sessions, data.movements, data.body, g.start, g.end, { perWeek: data.settings.summaryThreshold, muscleTarget: data.settings.muscleTarget });
  const off = r.muscles.filter((m) => m.status !== 'on' && (m.perWeek > 0 || r.completed > 0));
  const kinds = r.setKinds;
  return (
    <div className="sheet" onClick={onClose}>
      <div className="sheet-body report" role="dialog" aria-label="Insights" onClick={(e) => e.stopPropagation()}>
        <h3>{g.label} report</h3>
        <p className="hist-line"><span>Sessions</span><b>{r.completed} of {r.planned} planned{r.missed ? ` · ${r.missed} missed` : ''}{r.skipped ? ` · ${r.skipped} skipped` : ''}</b></p>
        <p className="hist-line"><span>Total volume</span><b>{r.volumeKg.toLocaleString()} kg{r.volumeChangePct != null ? ` (${sign(r.volumeChangePct)}% vs previous ${g.kind})` : ''}</b></p>
        <p className="hist-line"><span>Sets by type</span><span>{kinds.working} working · {kinds.warmup} warm-up · {kinds.drop} drop · {kinds.failure} to failure</span></p>

        <h4>Est. 1RM by lift</h4>
        {r.lifts.length ? r.lifts.map((l) => (
          <p key={l.id} className="hist-line"><span>{l.pr ? '🏆 ' : ''}{l.name}</span>
            <span className="nums">{l.pr ? <b className="tick-num">{l.e1rm}</b> : l.e1rm} kg {l.change != null ? <small className={l.change > 0 ? 'up' : l.change < 0 ? 'down' : ''}>({sign(l.change)} vs previous)</small> : <small>(new)</small>}</span></p>
        )) : <p className="muted">No weighted sets this {g.kind}.</p>}

        <h4>Sets per muscle per week (target {data.settings.muscleTarget})</h4>
        {off.length ? off.map((m) => (
          <p key={m.muscle} className="hist-line"><span>{m.label}</span><span className={m.status === 'under' ? 'down' : 'up'}>{m.perWeek} · {m.status === 'under' ? 'under' : 'over'}</span></p>
        )) : <p className="muted">Every muscle on target.</p>}

        <h4>Body</h4>
        <p className="muted small">Weight average uses fasted weigh-ins when any were logged this {g.kind}, otherwise every weigh-in.</p>
        {r.body.weightAvg != null || r.body.bodyFatChange != null || r.body.waistChange != null ? (
          <>
            {r.body.weightAvg != null && <p className="hist-line"><span>Weight avg</span><span>{r.body.weightAvg} kg{r.body.weightChange != null ? ` (${sign(r.body.weightChange, 2)} kg)` : ''}</span></p>}
            {r.body.bodyFatChange != null && <p className="hist-line"><span>Body fat</span><span>{sign(r.body.bodyFatChange)}%</span></p>}
            {r.body.waistChange != null && <p className="hist-line"><span>Waist</span><span>{sign(r.body.waistChange)} cm</span></p>}
          </>
        ) : <p className="muted">No weigh-ins this {g.kind}.</p>}
        <button className="primary wide" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}


function cardioLine(m: { name: string; durationMin?: number; distanceKm?: number }): string | null {
  if (!m.durationMin && !m.distanceKm) return null;
  const parts: string[] = [];
  if (m.durationMin) parts.push(`${m.durationMin} min`);
  if (m.distanceKm) parts.push(`${m.distanceKm} km`);
  if (m.durationMin && m.distanceKm && m.distanceKm > 0) {
    const total = m.durationMin / m.distanceKm;
    const mm = Math.floor(total);
    const ss = Math.round((total - mm) * 60);
    parts.push(`${mm}:${String(ss).padStart(2, '0')} /km`);
  }
  return parts.join(' · ');
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
      {view === 'sessions' && (groups.length === 0 ? <div className="empty"><h3>No sessions yet</h3><p>Finished workouts land here, grouped by week and month.</p></div> : groups.map((g) =>
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
                <span className="nums">{s.type === 'GVT' ? blocks(m.sets).map(blockLabel).join(', ') : m.sets.filter((x) => x.done).map((x) => `${x.kind && x.kind !== 'working' ? `${x.kind[0].toUpperCase()} ` : ''}${x.weight ?? '–'}×${x.reps ?? '–'}`).join('  ')}</span></p>
            );
          })}
        </>
      )}
      {modal && <InsightsModal g={modal} data={data} onClose={() => setModal(null)} />}
    </section>
  );
}
