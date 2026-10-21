import { useMemo, useState } from 'react';
import { completeSession, currentPlan, preview, skipSession } from '../engine/rotation';
import { DEFAULT_DAY, FLAG_INFO, SWAP_DEFAULTS } from '../data/movements';
import { penalisedHint, penaltyState } from '../engine/week';
import { AppData, previousFor, uid } from '../lib/store';
import { LoggedMovement, Movement, Session, SetKind } from '../types';
import RestTimer, { RestCue } from '../components/RestTimer';
import SetRow from '../components/SetRow';
import { suggestNext } from '../engine/progression';
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
  const [rest, setRest] = useState<RestCue>({ n: 0, seconds: 0 });
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
    if (updated.done && !was) {
      if (data.settings.vibrate) buzz(40);
      cueRest(movements, mi, si);
    }
  };

  /** Rest after a ticked set. In a superset, a short hop to the partner card, then full rest after the round. */
  const cueRest = (movements: LoggedMovement[], mi: number, si: number) => {
    const full = data.settings.restSeconds;
    const lm = movements[mi];
    const group = lm.superset ? movements.map((m, i) => ({ m, i })).filter((x) => x.m.superset === lm.superset) : [];
    if (group.length > 1) {
      const pos = group.findIndex((x) => x.i === mi);
      const partner = group[(pos + 1) % group.length].m;
      const partnerPending = partner.sets[si] && !partner.sets[si].done;
      setRest((r) => partnerPending
        ? { n: r.n + 1, seconds: data.settings.supersetRest, label: `→ ${short(partner.name)}` }
        : { n: r.n + 1, seconds: full, label: `Rest → ${short(group[0].m.name)}` });
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
  const fatigue = useMemo(() => muscleFatigue(data.sessions, data.movements), [data.sessions, data.movements]);
  const tired = recoveryHint(plan.focus, fatigue);
  const label = (id: string) => MUSCLES.find((m) => m.id === id)?.label ?? id;
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
        {tired.length > 0 && <p className="recovery">Probably still recovering: {tired.map(label).join(', ')}. Go lighter on those or pick another focus.</p>}
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
            const sug = mv ? suggestNext(mv, prev?.sets, { bar: data.settings.barKg, plates: data.settings.plates, extraReps: pen.elbowReps }) : { weight: null, reps: null, reason: 'none' as const };
            const sugP = penalisedHint(mv, { weight: sug.weight, reps: sug.reps }, penalty.multiplier, pen);
            const ssIndex = lm.superset ? draft.movements.filter((m) => m.superset === lm.superset).findIndex((m) => m === lm) : -1;
            return (
              <article key={mi} className={`card mv ${complete ? 'complete' : active ? 'active' : ''} ${flagged ? 'flagged' : ''} ${lm.superset ? 'superset' : ''}`}>
                {lm.superset && <span className="ss-tag">Superset {String.fromCharCode(65 + ssIndex)}</span>}
                <div className="mv-head">
                  <div>
                    <h3>{lm.name}</h3>
                    <small>{mv?.target}{mv?.notes ? ` · ${mv.notes}` : ''}</small>
                  </div>
                  <button className="ghost" onClick={() => setPicker({ mode: 'swap', index: mi })}>Swap</button>
                </div>
                {sug.reason !== 'none' && (
                  <p className="suggest">
                    <b>Next: {sugP.weight != null ? `${sugP.weight} kg × ` : ''}{sugP.reps}</b>
                    <span>{sug.reason === 'add-weight' ? 'Top of range hit. Add weight' : sug.reason === 'add-reps' ? 'Add a rep' : 'Repeat'}{sugP.addedKg || sugP.addedReps ? ' (incl. penalty)' : ''}</span>
                    {mv?.equipment === 'barbell' && sugP.weight != null && <span className="plates">{plateLabel(plateLoad(sugP.weight, data.settings.barKg, data.settings.plates))}</span>}
                  </p>
                )}
                {flagged && mv!.flags.map((f) => <p key={f} className="flag">⚠ {FLAG_INFO[f]?.reminder ?? f}</p>)}
                <div className="sets">
                  <div className="sets-h"><span>Set</span><span>kg</span><span>Reps</span><span /></div>
                  {lm.sets.map((s, si) => {
                    const prevSet = prev?.sets[si];
                    const base = (s.kind ?? 'working') !== 'working' || sug.reason === 'none' ? prevSet : { weight: sug.weight, reps: sug.reps };
                    const p = base ? penalisedHint(mv, base, penalty.multiplier, pen) : { weight: null, reps: (s.kind ?? 'working') === 'working' ? mv?.repMin ?? null : null };
                    return (
                      <SetRow key={si} index={si} s={s} hint={p}
                        onEdit={(patch) => updateSet(mi, si, patch)}
                        onKind={(k) => setKind(mi, si, k)}
                        onTick={() => updateSet(mi, si, s.done ? { reps: null } : { reps: s.reps ?? p.reps ?? null, weight: s.weight ?? p.weight ?? null })} />
                    );
                  })}
                </div>
                <div className="mv-foot">
                  <span className="muted">{prev ? `Last: ${prev.sets.filter((x) => x.done).map((x) => `${x.weight ?? '–'}×${x.reps ?? '–'}`).join(', ')}` : 'No previous session'}</span>
                  <span>
                    <button className="ghost" onClick={() => saveDraft(draft.movements.map((m, i) => i === mi ? { ...m, sets: [...m.sets, { reps: null, weight: null, done: false }] } : m))}>+ Set</button>
                    {(lm.superset || mi + 1 < draft.movements.length) && (
                      <button className="ghost" onClick={() => toggleSuperset(mi)}>{lm.superset ? 'Unlink' : 'Superset ↓'}</button>
                    )}
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

      <RestTimer cue={rest} sound={data.settings.sound} vibrate={data.settings.vibrate} />

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

const short = (name: string) => name.split(/[(/]/)[0].trim();
