import { useMemo, useState } from 'react';
import { completeSession, currentPlan, preview, skipSession } from '../engine/rotation';
import { DEFAULT_DAY, FLAG_INFO } from '../data/movements';
import { AppData, previousFor, uid } from '../lib/store';
import { LoggedMovement, Movement, Session } from '../types';
import RestTimer from '../components/RestTimer';
import GvtTimer from '../components/GvtTimer';

type Props = { data: AppData; setData: React.Dispatch<React.SetStateAction<AppData>> };

function blank(m: Movement): LoggedMovement {
  return { movementId: m.id, name: m.name, sets: Array.from({ length: m.sets || 3 }, () => ({ reps: null, weight: null, done: false })) };
}

export default function Today({ data, setData }: Props) {
  const plan = currentPlan(data.rotation);
  const byId = useMemo(() => new Map(data.movements.map((m) => [m.id, m])), [data.movements]);
  const [picker, setPicker] = useState<{ mode: 'add' | 'swap'; index?: number } | null>(null);
  const [rest, setRest] = useState(0);
  const [gvtPicks, setGvtPicks] = useState<string[] | null>(null);

  const draft =
    data.draft && data.draft.focus === plan.focus && data.draft.type === plan.type
      ? data.draft
      : {
          focus: plan.focus,
          type: plan.type,
          movements: (DEFAULT_DAY[plan.focus] ?? []).map((id) => byId.get(id)).filter(Boolean).map((m) => blank(m!)),
        };

  const saveDraft = (movements: LoggedMovement[]) => setData((d) => ({ ...d, draft: { ...draft, movements } }));

  const updateSet = (mi: number, si: number, patch: Partial<LoggedMovement['sets'][number]>) => {
    const movements = draft.movements.map((m, i) =>
      i !== mi ? m : { ...m, sets: m.sets.map((s, j) => (j === si ? { ...s, ...patch } : s)) },
    );
    saveDraft(movements);
    if (patch.done) setRest((r) => r + 1);
  };

  const finish = (status: Session['status'], extra: Partial<Session> = {}) => {
    const now = new Date().toISOString();
    const session: Session = {
      id: uid(), date: now, focus: plan.focus, type: plan.type, status,
      movements: status === 'completed' ? draft.movements.filter((m) => m.sets.some((s) => s.done) || extra.gvtRepsPerMinute) : [],
      author: 'app', updatedAt: now, ...extra,
    };
    if (status === 'completed' && !confirm(`Finish ${plan.focus} (${plan.type}) and advance the rotation?`)) return;
    if (status === 'skipped' && !confirm(`Skip ${plan.focus}? The plan rolls forward to the next focus.`)) return;
    setData((d) => ({
      ...d,
      sessions: [...d.sessions, session],
      rotation: status === 'completed' ? completeSession(d.rotation) : skipSession(d.rotation),
      draft: null,
    }));
    setGvtPicks(null);
  };

  const pick = (m: Movement) => {
    if (!picker) return;
    if (picker.mode === 'add') saveDraft([...draft.movements, blank(m)]);
    else saveDraft(draft.movements.map((x, i) => (i === picker.index ? blank(m) : x)));
    setPicker(null);
  };

  const next = preview(data.rotation, 4).slice(1);
  const doneCount = draft.movements.filter((m) => m.sets.length && m.sets.every((s) => s.done)).length;

  return (
    <section>
      <header className={`hero ${plan.type === 'GVT' ? 'gvt-day' : ''}`}>
        <small>Today</small>
        <h1>{plan.focus}</h1>
        <div className="pills">
          <span className={`pill ${plan.type}`}>{plan.type}</span>
          <span className="pill dim">Cycle {plan.cycleStep}/3</span>
          {plan.type === 'Normal' && <span className="pill dim">{doneCount}/{draft.movements.length} done</span>}
        </div>
        <p className="next">Up next: {next.map((n) => `${n.focus} · ${n.type}`).join('  →  ')}</p>
      </header>

      {plan.type === 'GVT' ? (
        <div className="card gvt-card">
          {!gvtPicks ? (
            <>
              <h3>Pick 3 movements</h3>
              <div className="chips">
                {data.movements.filter((m) => m.focus === plan.focus).map((m) => {
                  const on = draft.movements.slice(0, 3).some((x) => x.movementId === m.id);
                  return (
                    <button key={m.id} className={`chip ${on ? 'on' : ''}`} onClick={() => {
                      const cur = draft.movements.slice(0, 3);
                      const nextList = on ? cur.filter((x) => x.movementId !== m.id) : [...cur, blank({ ...m, sets: 1 })].slice(-3);
                      saveDraft(nextList);
                    }}>{m.name}</button>
                  );
                })}
              </div>
              <button className="primary wide" disabled={draft.movements.slice(0, 3).length !== 3} onClick={() => setGvtPicks(draft.movements.slice(0, 3).map((m) => m.movementId))}>
                Start GVT
              </button>
            </>
          ) : (
            <>
              <p className="muted">{draft.movements.slice(0, 3).map((m) => m.name).join(' · ')}</p>
              <GvtTimer {...data.settings.gvt} sound={data.settings.sound} vibrate={data.settings.vibrate}
                onFinish={(rpm) => finish('completed', { movements: draft.movements.slice(0, 3), gvtRepsPerMinute: rpm })} />
            </>
          )}
        </div>
      ) : (
        <>
          {draft.movements.map((lm, mi) => {
            const mv = byId.get(lm.movementId);
            const prev = previousFor(data.sessions, lm.movementId);
            const flagged = !!mv?.flags.length;
            const complete = lm.sets.length > 0 && lm.sets.every((s) => s.done);
            const active = !complete && lm.sets.some((s) => s.done || s.reps != null || s.weight != null);
            return (
              <article key={mi} className={`card mv ${complete ? 'complete' : active ? 'active' : ''} ${flagged ? 'flagged' : ''}`}>
                <div className="mv-head">
                  <div>
                    <h3>{lm.name}</h3>
                    <small>{mv?.target}{mv?.notes ? ` · ${mv.notes}` : ''}</small>
                  </div>
                  <button className="ghost" onClick={() => setPicker({ mode: 'swap', index: mi })}>Swap</button>
                </div>
                {flagged && mv!.flags.map((f) => <p key={f} className="flag">⚠ {FLAG_INFO[f]?.reminder ?? f}</p>)}
                <div className="sets">
                  <div className="sets-h"><span>Set</span><span>Reps</span><span>Weight</span><span /></div>
                  {lm.sets.map((s, si) => {
                    const p = prev?.sets[si];
                    return (
                      <div key={si} className={`set ${s.done ? 'done' : ''}`}>
                        <span>{si + 1}</span>
                        <input inputMode="numeric" placeholder={p?.reps != null ? String(p.reps) : '–'} value={s.reps ?? ''}
                          onChange={(e) => updateSet(mi, si, { reps: e.target.value === '' ? null : Number(e.target.value) })} />
                        <input inputMode="decimal" placeholder={p?.weight != null ? String(p.weight) : 'kg'} value={s.weight ?? ''}
                          onChange={(e) => updateSet(mi, si, { weight: e.target.value === '' ? null : Number(e.target.value) })} />
                        <button className={`tick ${s.done ? 'on' : ''}`} onClick={() => updateSet(mi, si, {
                          done: !s.done,
                          reps: s.reps ?? p?.reps ?? null,
                          weight: s.weight ?? p?.weight ?? null,
                        })}>✓</button>
                      </div>
                    );
                  })}
                </div>
                <div className="mv-foot">
                  <span className="muted">{prev ? `Last: ${prev.sets.filter((x) => x.done).map((x) => `${x.weight ?? '–'}×${x.reps ?? '–'}`).join(', ')}` : 'No previous session'}</span>
                  <span>
                    <button className="ghost" onClick={() => saveDraft(draft.movements.map((m, i) => i === mi ? { ...m, sets: [...m.sets, { reps: null, weight: null, done: false }] } : m))}>+ Set</button>
                    <button className="ghost" onClick={() => saveDraft(draft.movements.filter((_, i) => i !== mi))}>Remove</button>
                  </span>
                </div>
              </article>
            );
          })}
          <button className="ghost wide" onClick={() => setPicker({ mode: 'add' })}>+ Add movement</button>
          <button className="primary wide" onClick={() => finish('completed')}>Finish session</button>
        </>
      )}
      <div className="row center">
        <button className="ghost" onClick={() => finish('skipped')}>Skip {plan.focus} → next focus</button>
        <button className="ghost" disabled title="Coming in M2">Can't get to the gym? (M2)</button>
      </div>

      <RestTimer seconds={data.settings.restSeconds} sound={data.settings.sound} vibrate={data.settings.vibrate} trigger={rest} />

      {picker && (
        <div className="sheet" onClick={() => setPicker(null)}>
          <div className="sheet-body" onClick={(e) => e.stopPropagation()}>
            <h3>{picker.mode === 'add' ? 'Add movement' : 'Swap movement'}</h3>
            <Picker movements={data.movements} focus={plan.focus} onPick={pick} />
          </div>
        </div>
      )}
    </section>
  );
}

function Picker({ movements, focus, onPick }: { movements: Movement[]; focus: string; onPick: (m: Movement) => void }) {
  const [all, setAll] = useState(false);
  const [q, setQ] = useState('');
  const list = movements.filter((m) => (all || m.focus === focus) && m.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <div className="row">
        <input className="search" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className={`chip ${!all ? 'on' : ''}`} onClick={() => setAll(false)}>{focus}</button>
        <button className={`chip ${all ? 'on' : ''}`} onClick={() => setAll(true)}>All</button>
      </div>
      <ul className="pick">
        {list.map((m) => (
          <li key={m.id}><button onClick={() => onPick(m)}>{m.name}<small>{m.focus} · {m.target}{m.flags.length ? ' · ⚠' : ''}</small></button></li>
        ))}
      </ul>
    </>
  );
}
