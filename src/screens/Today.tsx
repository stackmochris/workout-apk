import { useEffect, useMemo, useState } from 'react';
import { completeSession, currentPlan, preview, skipSession } from '../engine/rotation';
import { DEFAULT_DAY, FLAG_INFO, SWAP_DEFAULTS } from '../data/movements';
import { penalisedHint, penaltyState } from '../engine/week';
import { AppData, previousFor, uid } from '../lib/store';
import { LoggedMovement, Movement, Session, SetKind, UserPrefs } from '../types';
import RestTimer, { RestCue } from '../components/RestTimer';
import SetRow from '../components/SetRow';
import { suggestNext, suggestDrop } from '../engine/progression';
import { plateLabel, plateLoad } from '../engine/plates';
import { muscleFatigue, recoveryHint } from '../engine/analytics';
import { MUSCLES } from '../data/muscles';
import { buzz } from '../lib/audio';
import GvtTimer from '../components/GvtTimer';
import SwapSession from '../components/SwapSession';
import NumInput from '../components/NumInput';
import { editSet } from '../engine/sets';
import { blockLabel, blocks, doneSets, logBlock } from '../engine/gvt';
import { FOCI, Focus, SessionType } from '../types';
import FinishSheet from '../components/FinishSheet';
import { computeSessionStats, SessionStats } from '../engine/sessionStats';
import { displayTarget } from '../engine/prescription';
import { Goal, Prescription } from '../types';

type Props = { data: AppData; setData: React.Dispatch<React.SetStateAction<AppData>>; prefs?: UserPrefs };

function blank(m: Movement): LoggedMovement {
  return { movementId: m.id, name: m.name, sets: Array.from({ length: m.sets || 3 }, () => ({ reps: null, weight: null, done: false })) };
}

export default function Today({ data, setData, prefs }: Props) {
  const planned = currentPlan(data.rotation);
  const [browse, setBrowse] = useState<{ focus: Focus; type: SessionType } | null>(null);
  const plan = browse ? { ...planned, ...browse } : planned;
  const onPlan = plan.focus === planned.focus && plan.type === planned.type;
  const [gvtRun, setGvtRun] = useState<{ index: number; weight: number | null } | null>(null);
  const [gvtKg, setGvtKg] = useState<Record<number, number | null>>({});
  const byId = useMemo(() => new Map(data.movements.map((m) => [m.id, m])), [data.movements]);
  const [picker, setPicker] = useState<{ mode: 'add' | 'swap'; index?: number } | null>(null);
  const [rest, setRest] = useState<RestCue>({ n: 0, seconds: 0 });
  const [gvtPicks, setGvtPicks] = useState<string[] | null>(null);
  const [swapping, setSwapping] = useState(false);
  const [finish, setFinish] = useState<{ session: Session; stats: SessionStats } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
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

  useEffect(() => {
    if (!draft.startedAt) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [draft.startedAt]);

  const elapsed = draft.startedAt
    ? Math.max(0, Math.floor((Date.now() - new Date(draft.startedAt).getTime()) / 1000))
    : 0;
  const elapsedLabel = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`;

  const saveDraft = (movements: LoggedMovement[], extra: Partial<NonNullable<AppData['draft']>> = {}) =>
    setData((d) => ({ ...d, draft: { ...draft, movements, ...extra } }));
  const savePrescription = (id: string, patch: Prescription) => {
    setData((d) => ({
      ...d,
      settings: {
        ...d.settings,
        prescriptions: { ...d.settings.prescriptions, [id]: { ...d.settings.prescriptions?.[id], ...patch } },
      },
    }));
  };


  const startTimer = () => {
    if (draft.startedAt) return;
    saveDraft(draft.movements, { startedAt: new Date().toISOString() });
  };

  const stopTimer = () => saveDraft(draft.movements, { startedAt: undefined });

  const updateSet = (mi: number, si: number, patch: { reps?: number | null; weight?: number | null; dropStart?: number | null; dropEnd?: number | null }) => {
    const was = draft.movements[mi].sets[si].done;
    const updated = editSet(draft.movements[mi].sets[si], patch);
    const movements = draft.movements.map((m, i) =>
      i !== mi ? m : { ...m, sets: m.sets.map((s, j) => (j === si ? updated : s)) },
    );
    const extra = !draft.startedAt && updated.done && !was ? { startedAt: new Date().toISOString() } : {};
    saveDraft(movements, extra);
    if (updated.done && !was) {
      if (data.settings.vibrate) buzz(40);
      cueRest(movements, mi, si);
    }
  };

  const cueRest = (movements: LoggedMovement[], mi: number, si: number) => {
    const full = data.settings.restSeconds;
    const lm = movements[mi];
    const group = lm.superset ? movements.map((m, i) => ({ m, i })).filter((x) => x.m.superset === lm.superset) : [];
    if (group.length > 1) {
      const pos = group.findIndex((x) => x.i === mi);
      const partner = group[(pos + 1) % group.length].m;
      const partnerPending = partner.sets[si] && !partner.sets[si].done;
      setRest((r) => partnerPending
        ? { n: r.n + 1, seconds: data.settings.supersetRest, label: `\u2192 ${short(partner.name)}` }
        : { n: r.n + 1, seconds: full, label: `Rest \u2192 ${short(group[0].m.name)}` });
      return;
    }
    setRest((r) => ({ n: r.n + 1, seconds: full, label: 'Rest' }));
  };

  const setKind = (mi: number, si: number, kind: SetKind) =>
    saveDraft(draft.movements.map((m, i) => i !== mi ? m : { ...m, sets: m.sets.map((x, j) => j === si ? { ...x, kind: kind === 'working' ? undefined : kind } : x) }));

  const toggleSuperset = (mi: number) => {
    const lm = draft.movements[mi];
    if (lm.superset) {
      const g = lm.superset;
      saveDraft(draft.movements.map((m) => (m.superset === g ? { ...m, superset: undefined } : m)));
    } else if (mi + 1 < draft.movements.length) {
      const g = draft.movements[mi + 1].superset ?? uid();
      saveDraft(draft.movements.map((m, i) => (i === mi || i === mi + 1 ? { ...m, superset: g } : m)));
    }
  };

  const requestFinish = (status: Session['status'], extra: Partial<Session> = {}) => {
    const now = new Date().toISOString();
    const session: Session = {
      id: uid(), date: now, focus: plan.focus, type: plan.type, status,
      movements: status === 'completed' ? draft.movements.filter((m) => m.sets.some((s) => s.done) || extra.gvtRepsPerMinute) : [],
      author: 'app', updatedAt: now,
      durationMin: draft.startedAt ? Math.max(1, Math.round((Date.now() - new Date(draft.startedAt).getTime()) / 60000)) : undefined,
      ...extra,
    };
    if (status === 'skipped') {
      if (!confirm(`Skip ${plan.focus}? The plan rolls forward to the next focus.`)) return;
      commitSession(session);
      return;
    }
    const stats = computeSessionStats(session, data.sessions, draft.startedAt);
    setFinish({ session, stats });
  };

  const commitSession = (session: Session) => {
    const onPlanNow = session.focus === planned.focus && session.type === planned.type;
    setData((d) => ({
      ...d,
      sessions: [...d.sessions, session],
      rotation: !onPlanNow ? d.rotation : session.status === 'completed' ? completeSession(d.rotation) : skipSession(d.rotation),
      draft: null,
    }));
    setGvtPicks(null);
    setGvtRun(null);
    setGvtKg({});
    setBrowse(null);
    setSwapping(false);
    setFinish(null);
  };

  const logGvt = (mi: number, weight: number | null, reps: number[]) => {
    if (!reps.length) return;
    if (!draft.startedAt) saveDraft(draft.movements.map((m, i) => (i === mi ? logBlock(m, weight, reps) : m)), { startedAt: new Date().toISOString() });
    else saveDraft(draft.movements.map((m, i) => (i === mi ? logBlock(m, weight, reps) : m)));
  };

  const pick = (m: Movement) => {
    if (!picker) return;
    if (picker.mode === 'add') saveDraft([...draft.movements, blank(m)]);
    else saveDraft(draft.movements.map((x, i) => (i === picker.index ? blank(m) : x)));
    setPicker(null);
  };

  const next = preview(data.rotation, 4).slice(1);
  const fatigue = useMemo(() => muscleFatigue(data.sessions, data.movements), [data.sessions, data.movements]);
  const tired = recoveryHint(plan.focus, fatigue);
  const label = (id: string) => MUSCLES.find((m) => m.id === id)?.label ?? id;
  const doneCount = draft.movements.filter((m) => m.sets.length && m.sets.every((s) => s.done)).length;

  return (
    <section>
      <header className={`hero ${plan.type === 'GVT' ? 'gvt-day' : ''}`}>
        <small>{onPlan ? 'Today' : 'Browsing'}</small>
        <h1>{plan.focus === 'NoGym' ? 'No Gym' : plan.focus}</h1>
        <div className="pills">
          <span className={`pill ${plan.type}`}>{plan.type}</span>
          <span className="pill dim">Cycle {plan.cycleStep}/3</span>
          {plan.type === 'Normal' && <span className="pill dim">{doneCount}/{draft.movements.length} done</span>}
          {draft.startedAt && <span className="pill">{elapsedLabel}</span>}
        </div>
        <div className="browse">
          <select aria-label="Browse focus" value={plan.focus} onChange={(e) => { setGvtPicks(null); setGvtRun(null); const f = e.target.value as Focus; setBrowse(f === planned.focus && plan.type === planned.type ? null : { focus: f, type: plan.type }); }}>
            {FOCI.map((f) => <option key={f} value={f}>{f === 'NoGym' ? 'No Gym' : f}</option>)}
          </select>
          {(['Normal', 'GVT'] as SessionType[]).map((t) => (
            <button key={t} className={`chip ${plan.type === t ? 'on' : ''}`} onClick={() => { setGvtPicks(null); setGvtRun(null); setBrowse(plan.focus === planned.focus && t === planned.type ? null : { focus: plan.focus, type: t }); }}>{t}</button>
          ))}
          {browse && <button className="ghost" onClick={() => { setBrowse(null); setGvtPicks(null); setGvtRun(null); }}>Back to today</button>}
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          {!draft.startedAt
            ? <button className="chip" onClick={startTimer}>Start workout</button>
            : <button className="chip" onClick={stopTimer}>Stop timer</button>}
        </div>
        {!onPlan && <p className="muted small">Browsing. Logging this won't move the rotation.</p>}
        {tired.length > 0 && <p className="recovery">Probably still recovering: {tired.map(label).join(', ')}. Go lighter on those or pick another focus.</p>}
        <p className="next">Up next: {next.map((n) => `${n.focus} \u00b7 ${n.type}`).join('  \u2192  ')}</p>
      </header>

      {penalty.multiplier > 0 && (
        <div className="banner penalty" role="status">
          <strong>Load penalty this week{penalty.multiplier > 1 ? ` \u00d7${penalty.multiplier}` : ''}</strong>
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
            requestFinish('completed', {
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
              <p className="muted">{gvtRun.weight ?? '\u2013'} kg{doneSets(draft.movements[gvtRun.index]) ? ` \u00b7 ${blocks(draft.movements[gvtRun.index].sets).map(blockLabel).join(', ')} logged` : ''}</p>
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
                    {done > 0 && <p className="muted">{blocks(lm.sets).map(blockLabel).join(' \u00b7 ')}</p>}
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
                onClick={() => requestFinish('completed', { movements: draft.movements.slice(0, 3).filter((m) => doneSets(m) > 0), gvtRepsPerMinute: draft.movements.slice(0, 3).flatMap((m) => m.sets.filter((x) => x.done).map((x) => x.reps ?? 0)) })}>
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
            const sug = mv ? suggestNext(mv, prev?.sets, { bar: data.settings.barKg, plates: data.settings.plates, extraReps: pen.elbowReps }) : { weight: null, reps: null, reason: 'none' as const };
            const sugP = penalisedHint(mv, { weight: sug.weight, reps: sug.reps }, penalty.multiplier, pen);
            const ssIndex = lm.superset ? draft.movements.filter((m) => m.superset === lm.superset).findIndex((m) => m === lm) : -1;
            return (
              <article key={mi} className={`card mv ${complete ? 'complete' : active ? 'active' : ''} ${flagged ? 'flagged' : ''} ${lm.superset ? 'superset' : ''}`}>
                {lm.superset && <span className="ss-tag">Superset {String.fromCharCode(65 + ssIndex)}</span>}
                <div className="mv-head">
                  <div>
                    <h3>{lm.name}</h3>
                    <small>{mv?.target}{mv?.notes ? ` \u00b7 ${mv.notes}` : ''}</small>
                  </div>
                  <button className="ghost" onClick={() => setPicker({ mode: 'swap', index: mi })}>Swap</button>
                </div>
                {mv && editing === mv.id && (
                  <div className="row" style={{ margin: '8px 0', gap: 6 }}>
                    <input style={{ width: 60 }} inputMode="numeric" placeholder="sets" defaultValue={data.settings.prescriptions?.[mv.id]?.sets ?? mv.sets}
                      onBlur={(e) => savePrescription(mv.id, { sets: e.target.value ? Number(e.target.value) : undefined })} />
                    <input style={{ width: 70 }} inputMode="numeric" placeholder="min" defaultValue={data.settings.prescriptions?.[mv.id]?.repMin ?? mv.repMin ?? ''}
                      onBlur={(e) => savePrescription(mv.id, { repMin: e.target.value ? Number(e.target.value) : null })} />
                    <input style={{ width: 70 }} inputMode="numeric" placeholder="max" defaultValue={data.settings.prescriptions?.[mv.id]?.repMax ?? mv.repMax ?? ''}
                      onBlur={(e) => savePrescription(mv.id, { repMax: e.target.value ? Number(e.target.value) : null })} />
                    <input style={{ flex: 1 }} placeholder="notes" defaultValue={data.settings.prescriptions?.[mv.id]?.notes ?? mv.notes ?? ''}
                      onBlur={(e) => savePrescription(mv.id, { notes: e.target.value || undefined })} />
                    <button className="ghost" onClick={() => { savePrescription(mv.id, {}); setEditing(null); }}>Done</button>
                  </div>
                )}
                {sug.reason !== 'none' && (
                  <p className="suggest">
                    <b>Next: {sugP.weight != null ? `${sugP.weight} kg \u00d7 ` : ''}{sugP.reps}</b>
                    <span>{sug.reason === 'add-weight' ? 'Top of range hit. Add weight' : sug.reason === 'add-reps' ? 'Add a rep' : 'Repeat'}{sugP.addedKg || sugP.addedReps ? ' (incl. penalty)' : ''}</span>
                    {mv?.equipment === 'barbell' && sugP.weight != null && <span className="plates">{plateLabel(plateLoad(sugP.weight, data.settings.barKg, data.settings.plates))}</span>}
                  </p>
                )}
                {flagged && mv!.flags.map((f) => <p key={f} className="flag">\u26a0 {FLAG_INFO[f]?.reminder ?? f}</p>)}
                <div className="sets">
                  <div className="sets-h"><span>Set</span><span>kg</span><span>Reps</span><span /></div>
                  {lm.sets.map((s, si) => {
                    const prevSet = prev?.sets[si];
                    const base = (s.kind ?? 'working') !== 'working' || sug.reason === 'none' ? prevSet : { weight: sug.weight, reps: sug.reps };
                    const p = base ? penalisedHint(mv, base, penalty.multiplier, pen) : { weight: null, reps: (s.kind ?? 'working') === 'working' ? mv?.repMin ?? null : null };
                    const dropHint = s.kind === 'drop' ? suggestDrop(prevSet, s.dropStart ?? s.weight) : null;
                    return (
                      <>
                        <SetRow key={si} index={si} s={s} hint={p}
                          onEdit={(patch) => updateSet(mi, si, patch)}
                          onKind={(k) => setKind(mi, si, k)}
                          onTick={() => updateSet(mi, si, s.done ? { reps: null } : { reps: s.reps ?? p.reps ?? null, weight: s.weight ?? p.weight ?? null })} />
                        {dropHint?.end != null && s.dropEnd == null && (
                          <p className="muted small" style={{ margin: '2px 0 6px 44px' }}>Drop to ~{dropHint.end} kg{dropHint.dropKg ? ` (\u2212${dropHint.dropKg} kg)` : ''}</p>
                        )}
                      </>
                    );
                  })}
                </div>
                <div className="mv-foot">
                  <span className="muted">{prev ? `Last: ${prev.sets.filter((x) => x.done).map((x) => `${x.weight ?? '\u2013'}\u00d7${x.reps ?? '\u2013'}`).join(', ')}` : 'No previous session'}</span>
                  <span>
                    <button className="ghost" onClick={() => saveDraft(draft.movements.map((m, i) => i === mi ? { ...m, sets: [...m.sets, { reps: null, weight: null, done: false }] } : m))}>+ Set</button>
                    {(lm.superset || mi + 1 < draft.movements.length) && (
                      <button className="ghost" onClick={() => toggleSuperset(mi)}>{lm.superset ? 'Unlink' : 'Superset \u2193'}</button>
                    )}
                    <button className="ghost" onClick={() => saveDraft(draft.movements.filter((_, i) => i !== mi))}>Remove</button>
                  </span>
                </div>
              </article>
            );
          })}
          {draft.movements.length === 0 && (
            <div className="card" style={{ textAlign: 'center', padding: '24px 16px' }}>
              <h3 style={{ margin: '0 0 6px' }}>Freestyle</h3>
              <p className="muted">No movements yet. Add what you want to do today.</p>
            </div>
          )}
          <button className="ghost wide" onClick={() => setPicker({ mode: 'add' })}>+ Add movement</button>
          <button className="primary wide" onClick={() => requestFinish('completed')}>Finish session</button>
        </>
      )}
      <div className="row center">
        {onPlan && <button className="ghost" onClick={() => requestFinish('skipped')}>Skip {plan.focus} \u2192 next focus</button>}
        
      </div>

      <RestTimer cue={rest} sound={data.settings.sound} vibrate={data.settings.vibrate} />

      {picker && (
        <div className="sheet" onClick={() => setPicker(null)}>
          <div className="sheet-body" onClick={(e) => e.stopPropagation()}>
            <h3>{picker.mode === 'add' ? 'Add movement' : 'Swap movement'}</h3>
            <Picker movements={data.movements} focus={plan.focus} onPick={pick} />
          </div>
        </div>
      )}

      {finish && (
        <FinishSheet
          stats={finish.stats}
          focus={finish.session.focus}
          type={finish.session.type}
          onCancel={() => setFinish(null)}
          onConfirm={() => commitSession(finish.session)}
        />
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
        <button className={`chip ${all ? 'on' : ''}`} onClick={() => setAll((v) => !v)}>{all ? 'All' : focus}</button>
      </div>
      <ul className="pick">
        {list.map((m) => <li key={m.id}><button onClick={() => onPick(m)}>{m.name}<small>{m.focus} \u00b7 {m.target}</small></button></li>)}
        {!list.length && <li className="muted pad">Nothing matches.</li>}
      </ul>
    </>
  );
}

function short(name: string) {
  return name.split('(')[0].trim().slice(0, 18);
}
