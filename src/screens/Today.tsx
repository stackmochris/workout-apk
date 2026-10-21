import { useMemo, useState } from 'react';
import { completeSession, currentPlan, preview, skipSession } from '../engine/rotation';
import { DEFAULT_DAY, FLAG_INFO, SWAP_DEFAULTS } from '../data/movements';
import { penalisedHint, penaltyState } from '../engine/week';
import { AppData, previousFor, uid } from '../lib/store';
import { LoggedMovement, Movement, Session } from '../types';
import RestTimer from '../components/RestTimer';
import GvtTimer from '../components/GvtTimer';
import SwapSession from '../components/SwapSession';
import NumInput from '../components/NumInput';
import { editSet } from '../engine/sets';
import { blockLabel, blocks, doneSets, logBlock } from '../engine/gvt';
import { FOCI, Focus, SessionType } from '../types';

type Props = { data: AppData; setData: React.Dispatch<React.SetStateAction<AppData>> };

function blank(m: Movement): LoggedMovement {
  return { movementId: m.id, name: m.name, sets: Array.from({ length: m.sets || 3 }, () => ({ reps: null, weight: null, done: false })) };
}

export default function Today({ data, setData }: Props) {
  const planned = currentPlan(data.rotation);
  const [browse, setBrowse] = useState<{ focus: Focus; type: SessionType } | null>(null);
  const plan = browse ? { ...planned, ...browse } : planned;
  const onPlan = plan.focus === planned.focus && plan.type === planned.type;
  const [gvtRun, setGvtRun] = useState<{ index: number; weight: number | null } | null>(null);
  const [gvtKg, setGvtKg] = useState<Record<number, number | null>>({});
  const byId = useMemo(() => new Map(data.movements.map((m) => [m.id, m])), [data.movements]);
  const [picker, setPicker] = useState<{ mode: 'add' | 'swap'; index?: number } | null>(null);
  const [rest, setRest] = useState(0);
  const [gvtPicks, setGvtPicks] = useState<string[] | null>(null);
  const [swapping, setSwapping] = useState(false);
  const pen = data.settings.penalty;
  const penalty = useMemo(
    () => penaltyState(data.sessions, new Date(), data.settings.summaryThreshold, pen.stack),
    [data.sessions, data.settings.summaryThreshold, pen.stack],
  );

  const draft =
    data.draft && data.draft.focus === plan.focus && data.draft.type === plan.type
      ? data.draft
      : {
          focus: plan.focus,
          type: plan.type,
          movements: (DEFAULT_DAY[plan.focus] ?? []).map((id) => byId.get(id)).filter(Boolean).map((m) => blank(m!)),
        };

  const saveDraft = (movements: LoggedMovement[]) => setData((d) => ({ ...d, draft: { ...draft, movements } }));

  const updateSet = (mi: number, si: number, patch: { reps?: number | null; weight?: number | null }) => {
    const was = draft.movements[mi].sets[si].done;
    const updated = editSet(draft.movements[mi].sets[si], patch);
    const movements = draft.movements.map((m, i) =>
      i !== mi ? m : { ...m, sets: m.sets.map((s, j) => (j === si ? updated : s)) },
    );
    saveDraft(movements);
    if (updated.done && !was) setRest((r) => r + 1);
  };

  const finish = (status: Session['status'], extra: Partial<Session> = {}) => {
    const now = new Date().toISOString();
    const session: Session = {
      id: uid(), date: now, focus: plan.focus, type: plan.type, status,
      movements: status === 'completed' ? draft.movements.filter((m) => m.sets.some((s) => s.done) || extra.gvtRepsPerMinute) : [],
      author: 'app', updatedAt: now, ...extra,
    };
    if (status === 'completed' && !extra.swap && !confirm(onPlan ? `Finish ${plan.focus} (${plan.type}) and advance the rotation?` : `Log ${plan.focus} (${plan.type})? It is not today's planned session, so the rotation stays put.`)) return;
    if (status === 'skipped' && !confirm(`Skip ${plan.focus}? The plan rolls forward to the next focus.`)) return;
    setData((d) => ({
      ...d,
      sessions: [...d.sessions, session],
      rotation: !onPlan ? d.rotation : status === 'completed' ? completeSession(d.rotation) : skipSession(d.rotation),
      draft: null,
    }));
    setGvtPicks(null);
    setGvtRun(null);
    setGvtKg({});
    setBrowse(null);
    setSwapping(false);
  };

  const logGvt = (mi: number, weight: number | null, reps: number[]) => {
    if (!reps.length) return;
    saveDraft(draft.movements.map((m, i) => (i === mi ? logBlock(m, weight, reps) : m)));
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
        <small>{onPlan ? 'Today' : 'Browsing'}</small>
        <h1>{plan.focus}</h1>
        <div className="pills">
          <span className={`pill ${plan.type}`}>{plan.type}</span>
          <span className="pill dim">Cycle {plan.cycleStep}/3</span>
          {plan.type === 'Normal' && <span className="pill dim">{doneCount}/{draft.movements.length} done</span>}
        </div>
        <div className="browse">
          <select aria-label="Browse focus" value={plan.focus} onChange={(e) => { setGvtPicks(null); setGvtRun(null); const f = e.target.value as Focus; setBrowse(f === planned.focus && plan.type === planned.type ? null : { focus: f, type: plan.type }); }}>
            {FOCI.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          {(['Normal', 'GVT'] as SessionType[]).map((t) => (
            <button key={t} className={`chip ${plan.type === t ? 'on' : ''}`} onClick={() => { setGvtPicks(null); setGvtRun(null); setBrowse(plan.focus === planned.focus && t === planned.type ? null : { focus: plan.focus, type: t }); }}>{t}</button>
          ))}
          {browse && <button className="ghost" onClick={() => { setBrowse(null); setGvtPicks(null); setGvtRun(null); }}>Back to today</button>}
        </div>
        {!onPlan && <p className="muted small">Browsing. Logging this won't move the rotation.</p>}
        <p className="next">Up next: {next.map((n) => `${n.focus} · ${n.type}`).join('  →  ')}</p>
      </header>

      {penalty.multiplier > 0 && (
        <div className="banner penalty" role="status">
          <strong>Load penalty this week{penalty.multiplier > 1 ? ` ×${penalty.multiplier}` : ''}</strong>
          <span>
            Last week: {penalty.lastWeekCount} of {data.settings.summaryThreshold} sessions. Working-load hints are up
            {' '}+{pen.barbellKg * penalty.multiplier} kg barbell, +{pen.dumbbellCableKg * penalty.multiplier} kg dumbbell and cable,
            {' '}+{pen.elbowReps * penalty.multiplier} reps on elbow-flagged movements.
          </span>
        </div>
      )}

      {swapping ? (
        <SwapSession
          focus={plan.focus}
          option={SWAP_DEFAULTS[plan.focus]}
          onCancel={() => setSwapping(false)}
          onFinish={(name, reps) => {
            if (!confirm(`Log ${name} as today's ${plan.focus} session and advance the rotation?`)) return;
            finish('completed', {
              swap: true,
              movements: [{ movementId: `swap-${plan.focus.toLowerCase()}`, name, sets: reps.map((r) => ({ reps: r, weight: null, done: true })) }],
            });
          }}
        />
      ) : plan.type === 'GVT' ? (
        <div className="card gvt-card">
          {!gvtPicks && !draft.movements.slice(0, 3).some((m) => doneSets(m) > 0) ? (
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
          ) : gvtRun ? (
            <>
              <h3>{draft.movements[gvtRun.index].name}</h3>
              <p className="muted">{gvtRun.weight ?? '–'} kg{doneSets(draft.movements[gvtRun.index]) ? ` · ${blocks(draft.movements[gvtRun.index].sets).map(blockLabel).join(', ')} logged` : ''}</p>
              <GvtTimer key={`${gvtRun.index}-${doneSets(draft.movements[gvtRun.index])}`} {...data.settings.gvt} sound={data.settings.sound} vibrate={data.settings.vibrate}
                startAt={doneSets(draft.movements[gvtRun.index])} weight={gvtRun.weight} autoStart
                onAdjust={(reps) => { logGvt(gvtRun.index, gvtRun.weight, reps); setGvtKg((k) => ({ ...k, [gvtRun.index]: null })); setGvtRun(null); }}
                onFinish={(reps) => { logGvt(gvtRun.index, gvtRun.weight, reps); setGvtRun(null); }} />
            </>
          ) : (
            <>
              {draft.movements.slice(0, 3).map((lm, mi) => {
                const done = doneSets(lm);
                const total = data.settings.gvt.sets;
                const prev = previousFor(data.sessions, lm.movementId);
                const prevKg = prev ? [...prev.sets].reverse().find((x) => x.done && x.weight != null)?.weight : undefined;
                return (
                  <article key={lm.movementId} className={`card mv ${done >= total ? 'complete' : done ? 'active' : ''}`}>
                    <h3>{lm.name}</h3>
                    {done > 0 && <p className="muted">{blocks(lm.sets).map(blockLabel).join(' · ')}</p>}
                    {done < total ? (
                      <div className="gvt-start">
                        <NumInput kind="kg" label={`${lm.name} kg`} value={gvtKg[mi] ?? null} placeholder={prevKg != null ? String(prevKg) : 'kg'}
                          onChange={(n) => setGvtKg((k) => ({ ...k, [mi]: n }))} />
                        <button className="primary" onClick={() => setGvtRun({ index: mi, weight: gvtKg[mi] ?? prevKg ?? null })}>
                          {done ? `Start set ${done + 1}` : 'Start'}
                        </button>
                      </div>
                    ) : <p className="muted">{total} sets done</p>}
                  </article>
                );
              })}
              <button className="primary wide" disabled={!draft.movements.slice(0, 3).some((m) => doneSets(m) > 0)}
                onClick={() => finish('completed', { movements: draft.movements.slice(0, 3).filter((m) => doneSets(m) > 0), gvtRepsPerMinute: draft.movements.slice(0, 3).flatMap((m) => m.sets.filter((x) => x.done).map((x) => x.reps ?? 0)) })}>
                Finish GVT session
              </button>
              <button className="ghost wide" onClick={() => setGvtPicks(null)}>Change movements</button>
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
                  <div className="sets-h"><span>Set</span><span>kg</span><span>Reps</span><span /></div>
                  {lm.sets.map((s, si) => {
                    const p = prev?.sets[si] ? penalisedHint(mv, prev.sets[si], penalty.multiplier, pen) : undefined;
                    return (
                      <div key={si} className={`set ${s.done ? 'done' : ''}`}>
                        <span>{si + 1}</span>
                        <NumInput kind="kg" label={`Set ${si + 1} kg`} placeholder={p?.weight != null ? String(p.weight) : 'kg'} value={s.weight}
                          onChange={(n) => updateSet(mi, si, { weight: n })} />
                        <NumInput kind="reps" label={`Set ${si + 1} reps`} placeholder={p?.reps != null ? String(p.reps) : 'reps'} value={s.reps}
                          onChange={(n) => updateSet(mi, si, { reps: n })} />
                        <button aria-label={s.done ? 'Done. Tap to clear' : 'Same as last time'} title={s.done ? 'Clear set' : 'Use last session'} className={`tick ${s.done ? 'on' : ''}`}
                          onClick={() => updateSet(mi, si, s.done ? { reps: null } : { reps: p?.reps ?? null, weight: s.weight ?? p?.weight ?? null })}>✓</button>
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
        {onPlan && <button className="ghost" onClick={() => finish('skipped')}>Skip {plan.focus} → next focus</button>}
        {!swapping && <button className="ghost" onClick={() => setSwapping(true)}>Can't get to the gym?</button>}
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
