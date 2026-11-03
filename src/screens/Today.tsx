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


const CARDIO = /zoned cardio|hike|walk|run|stairs|jump rope|cardio/i;
function isCardio(name: string) { return CARDIO.test(name); }
function metFor(name: string): number {
  const n = name.toLowerCase();
  if (n.includes('hard') || n.includes('run')) return 9.5;
  if (n.includes('moderate')) return 6.5;
  if (n.includes('easy') || n.includes('walk') || n.includes('hike')) return 4.0;
  if (n.includes('stair')) return 8.0;
  return 5.0;
}
function paceLabel(min: number | undefined, km: number | undefined): string | null {
  if (!min || !km || km <= 0) return null;
  const total = min / km;
  const m = Math.floor(total);
  const sec = Math.round((total - m) * 60);
  return `${m}:${String(sec).padStart(2, '0')} /km`;
}
function kcalLabel(name: string, min: number | undefined, kg: number): string | null {
  if (!min || min <= 0) return null;
  const kcal = Math.round(metFor(name) * kg * (min / 60));
  return `~${kcal} kcal`;
}

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
  const [picker, setPicker] = useState<{ mode: 'add' | 'swap' | 'superset'; index?: number } | null>(null);
  const [ssPick, setSsPick] = useState<{ index: number; selected: number[] } | null>(null);
  const [rest, setRest] = useState<RestCue>({ n: 0, seconds: 0 });
  const [gvtPicks, setGvtPicks] = useState<string[] | null>(null);
  const [swapping, setSwapping] = useState(false);
  const [finish, setFinish] = useState<{ session: Session; stats: SessionStats } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});
  const [checkin, setCheckin] = useState<{ weight: string; energy: number; elbow: 'ok' | 'sore' } | null>(null);
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
    const start = (() => { const x = new Date(); const day = x.getDay(); const diff = x.getDate() - day + (day === 0 ? -6 : 1); x.setDate(diff); x.setHours(0,0,0,0); return x; })();
    const has = data.body.some((b) => new Date(b.date) >= start);
    const skipped = sessionStorage.getItem('checkin-skipped') === start.toISOString().slice(0, 10);
    if (!has && !skipped && !checkin) setCheckin({ weight: '', energy: 5, elbow: 'ok' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!draft.startedAt) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [draft.startedAt]);
  useEffect(() => {
    const d = data.draft;
    if (!d) return;
    const check = () => {
      const last = d.lastInputAt || d.startedAt;
      if (!last) return;
      const idle = Date.now() - new Date(last).getTime();
      const open = d.startedAt ? Date.now() - new Date(d.startedAt).getTime() : idle;
      const hasWork = d.movements.some((m) => m.finished || m.durationMin || m.distanceKm || m.sets.some((s) => s.done));
      if (!hasWork && open > 36 * 3600_000) {
        setData((cur) => ({ ...cur, draft: null }));
        return;
      }
      if (hasWork && (idle > 5 * 3600_000 || open > 36 * 3600_000)) {
        const now = new Date().toISOString();
        const ordered = byPerformed(d.movements.filter((m) => m.finished || m.durationMin || m.distanceKm || m.sets.some((s) => s.done)));
        const session: Session = {
          id: uid(), date: now, focus: d.focus as Focus, type: d.type as SessionType, status: 'completed',
          movements: ordered, author: 'app', updatedAt: now,
          durationMin: d.startedAt ? Math.max(1, Math.round((Date.now() - new Date(d.startedAt).getTime()) / 60000)) : undefined,
          notes: 'Auto-finished (idle)',
        };
        commitSession(session);
      }
    };
    check();
    const id = setInterval(check, 60_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.draft?.lastInputAt, data.draft?.startedAt]);


  const elapsed = draft.startedAt
    ? Math.max(0, Math.floor((Date.now() - new Date(draft.startedAt).getTime()) / 1000))
    : 0;
  const elapsedLabel = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`;

  const saveDraft = (movements: LoggedMovement[], extra: Partial<NonNullable<AppData['draft']>> = {}) =>
    setData((d) => ({ ...d, draft: { ...draft, movements, lastInputAt: new Date().toISOString(), ...extra } }));
  
  const setMovementNotes = (mi: number, notes: string) =>
    saveDraft(draft.movements.map((m, i) => i === mi ? { ...m, notes: notes || undefined } : m));

  const setCardio = (mi: number, patch: { durationMin?: number; distanceKm?: number }) => {
    const now = new Date().toISOString();
    saveDraft(draft.movements.map((m, i) => i === mi ? { ...m, ...patch, performedAt: m.performedAt ?? now } : m));
  };

  const finishMovement = (mi: number) => {
    saveDraft(draft.movements.map((m, i) => i === mi ? { ...m, finished: true } : m));
    setCollapsed((c) => ({ ...c, [mi]: true }));
  };
  const saveCheckin = () => {
    if (!checkin) return;
    const entry = {
      id: uid(), date: new Date().toISOString(),
      weight: checkin.weight ? Number(checkin.weight) : undefined,
      energy: checkin.energy, elbow: checkin.elbow,
      author: 'app' as const, updatedAt: new Date().toISOString(),
    };
    setData((d) => ({ ...d, body: [...d.body, entry] }));
    setCheckin(null);
  };
  const skipCheckin = () => {
    const x = new Date(); const day = x.getDay(); const diff = x.getDate() - day + (day === 0 ? -6 : 1); x.setDate(diff);
    sessionStorage.setItem('checkin-skipped', x.toISOString().slice(0, 10));
    setCheckin(null);
  };

  const reopenMovement = (mi: number) => {
    saveDraft(draft.movements.map((m, i) => i === mi ? { ...m, finished: false } : m));
    setCollapsed((c) => ({ ...c, [mi]: false }));
  };

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
    const stamp = updated.done && !was && !draft.movements[mi].performedAt ? new Date().toISOString() : undefined;
    const movements = draft.movements.map((m, i) =>
      i !== mi ? m : { ...m, performedAt: stamp ?? m.performedAt, sets: m.sets.map((s, j) => (j === si ? updated : s)) },
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
      const pending = group.filter((x) => !x.m.sets[si]?.done);
      if (pending.length) return; // more movements in this set — no rest
      setRest((r) => ({ n: r.n + 1, seconds: full, label: `Rest → ${short(group[0].m.name)}` }));
      return;
    }
    setRest((r) => ({ n: r.n + 1, seconds: full, label: 'Rest' }));
  };

  const setKind = (mi: number, si: number, kind: SetKind) =>
    saveDraft(draft.movements.map((m, i) => i !== mi ? m : { ...m, sets: m.sets.map((x, j) => j === si ? { ...x, kind: kind === 'working' ? undefined : kind } : x) }));

  const startSuperset = (mi: number) => setSsPick({ index: mi, selected: [] });

  const addToSuperset = (primary: number, partners: number[]) => {
    const g = draft.movements[primary].superset ?? uid();
    const ids = new Set([primary, ...partners]);
    saveDraft(draft.movements.map((m, i) => ids.has(i) ? { ...m, superset: g } : m));
  };

  const unlinkOne = (mi: number) => {
    const g = draft.movements[mi].superset;
    if (!g) return;
    const left = draft.movements.filter((m, i) => i !== mi && m.superset === g).length;
    saveDraft(draft.movements.map((m, i) => (i === mi || (left <= 1 && m.superset === g)) ? { ...m, superset: undefined } : m));
  };

  const unlinkAll = (mi: number) => {
    const g = draft.movements[mi].superset;
    if (!g) return;
    saveDraft(draft.movements.map((m) => m.superset === g ? { ...m, superset: undefined } : m));
  };

  
  const byPerformed = (list: LoggedMovement[]) =>
    [...list].sort((a, b) => {
      const ta = a.performedAt ? new Date(a.performedAt).getTime() : Infinity;
      const tb = b.performedAt ? new Date(b.performedAt).getTime() : Infinity;
      return ta - tb;
    });

  const moveCard = (mi: number, dir: -1 | 1) => {
    const next = mi + dir;
    if (next < 0 || next >= draft.movements.length) return;
    const list = [...draft.movements];
    [list[mi], list[next]] = [list[next], list[mi]];
    saveDraft(list);
  };

  const requestFinish = (status: Session['status'], extra: Partial<Session> = {}) => {
    const now = new Date().toISOString();
    const session: Session = {
      id: uid(), date: now, focus: plan.focus, type: plan.type, status,
      movements: status === 'completed' ? byPerformed(draft.movements.filter((m) => m.finished || m.durationMin || m.distanceKm || m.sets.some((s) => s.done) || extra.gvtRepsPerMinute)) : [],
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
    if (picker.mode === 'superset' && ssPick) {
      const g = draft.movements[ssPick.index].superset ?? uid();
      const next = draft.movements.map((x, i) => i === ssPick.index ? { ...x, superset: g } : x);
      next.push({ ...blank(m), superset: g });
      saveDraft(next);
    } else if (picker.mode === 'add') saveDraft([...draft.movements, blank(m)]);
    else saveDraft(draft.movements.map((x, i) => (i === picker.index ? blank(m) : x)));
    setPicker(null);
  };

  const next = preview(data.rotation, 4).slice(1);
  const fatigue = useMemo(() => muscleFatigue(data.sessions, data.movements), [data.sessions, data.movements]);
  const tired = recoveryHint(plan.focus, fatigue);
  const label = (id: string) => MUSCLES.find((m) => m.id === id)?.label ?? id;
  const doneCount = draft.movements.filter((m) => m.finished || m.durationMin || m.distanceKm || (m.sets.length && m.sets.every((s) => s.done))).length;
  const bodyKg = [...data.body].reverse().find((b) => b.weight)?.weight ?? 80;

  return (
    <section>
      <header className={`hero ${plan.type === 'GVT' ? 'gvt-day' : ''}`}>
        <small>{onPlan ? 'Today' : 'Browsing'}{data.settings.displayName ? ` · ${data.settings.displayName}` : ''}</small>
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
          
          {browse && <button className="ghost" onClick={() => { setBrowse(null); setGvtPicks(null); setGvtRun(null); }}>Back to today</button>}
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          {!draft.startedAt
            ? <button className="chip" onClick={startTimer}>Start workout</button>
            : <button className="chip" onClick={stopTimer}>Stop timer</button>}
        </div>
        {!onPlan && <p className="muted small">Browsing. Logging this won't move the rotation.</p>}
        {tired.length > 0 && <p className="recovery">Probably still recovering: {tired.map(label).join(', ')}. Go lighter on those or pick another focus.</p>}
        <p className="next">Up next: {next.map((n) => `${n.focus} \u00b7 ${n.type}`).join('  →  ')}</p>
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
      ) : (
        <>
          {(() => {
          const indexed = draft.movements.map((lm, mi) => ({ lm, mi, complete: !!lm.finished || (lm.sets.length > 0 && lm.sets.every((s) => s.done)) }));
          const ordered = [...indexed.filter((x) => !x.complete), ...indexed.filter((x) => x.complete)];
          return ordered.filter(({ lm, mi }) => {
            if (!lm.superset) return true;
            const first = draft.movements.findIndex((m) => m.superset === lm.superset);
            return first === mi;
          }).map(({ lm, mi, complete }) => {
            const mv = byId.get(lm.movementId);
            const prev = previousFor(data.sessions, lm.movementId);
            const flagged = !!mv?.flags.length;
            const active = !complete && lm.sets.some((s) => s.done || s.reps != null || s.weight != null);
            const sug = mv ? suggestNext(mv, prev?.sets, { bar: data.settings.barKg, plates: data.settings.plates, extraReps: pen.elbowReps }) : { weight: null, reps: null, reason: 'none' as const };
            const sugP = penalisedHint(mv, { weight: sug.weight, reps: sug.reps }, penalty.multiplier, pen);
            const ssIndex = lm.superset ? draft.movements.filter((m) => m.superset === lm.superset).findIndex((m) => m === lm) : -1;
            return (
              <article key={mi} className={`card mv ${complete ? 'complete' : active ? 'active' : ''} ${flagged ? 'flagged' : ''} ${lm.superset ? 'superset' : ''}`}>
                {lm.superset && (
                  <span className="ss-tag">
                    {draft.movements.filter((m) => m.superset === lm.superset).map((m) => m.name).join(' → ')}
                  </span>
                )}
                <div className="mv-head" onClick={() => complete && setCollapsed((c) => ({ ...c, [mi]: !c[mi] }))} style={complete ? { cursor: 'pointer' } : undefined}>
                  <div>
                    <h3>{lm.name}{complete ? (collapsed[mi] === false ? ' ▾' : ' ▸') : ''}</h3>
                    <small>{mv ? displayTarget(mv, data.settings.goal, data.settings.prescriptions?.[mv.id]) : ''}{prev?.notes ? ` · Last: ${prev.notes}` : ''}</small>
                  </div>
                </div>
                <div className="mv-actions" onClick={(e) => e.stopPropagation()}>
                  <span className="mv-actions-group">
                    <button className="icon" disabled={mi === 0} onClick={() => moveCard(mi, -1)} aria-label="Move up">↑</button>
                    <button className="icon" disabled={mi === draft.movements.length - 1} onClick={() => moveCard(mi, 1)} aria-label="Move down">↓</button>
                  </span>
                  <span className="mv-actions-group">
                    <button className={`chip ${lm.gvt ? 'on' : ''}`} onClick={() => saveDraft(draft.movements.map((m, i) => i === mi ? { ...m, gvt: !m.gvt } : m))}>GVT</button>
                    <button className="chip" onClick={() => setPicker({ mode: 'swap', index: mi })}>Swap</button>
                  </span>
                </div>
                {complete && collapsed[mi] !== false ? null : (
                <>
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
                {lm.gvt ? (
                  <div>
                    {blocks(lm.sets).length > 0 && (
                      <p className="muted" style={{ margin: '4px 0 8px' }}>
                        {blocks(lm.sets).map(blockLabel).join(' · ')}
                      </p>
                    )}
                    <div className="gvt-start" style={{ marginBottom: 8 }}>
                      <NumInput kind="kg" label={`${lm.name} kg`} value={gvtKg[mi] ?? null}
                        placeholder={(() => { const p = previousFor(data.sessions, lm.movementId); const w = p ? [...p.sets].reverse().find((x) => x.done && x.weight != null)?.weight : undefined; return w != null ? String(w) : 'kg'; })()}
                        onChange={(n) => setGvtKg((k) => ({ ...k, [mi]: n }))} />
                    </div>
                    <GvtTimer key={`${mi}-${doneSets(lm)}`} {...data.settings.gvt} sound={data.settings.sound} vibrate={data.settings.vibrate}
                      startAt={doneSets(lm)} weight={gvtKg[mi] ?? null}
                      onFinish={(reps) => { logGvt(mi, gvtKg[mi] ?? null, reps); setGvtKg((k) => ({ ...k, [mi]: null })); }}
                      onAdjust={(reps) => { logGvt(mi, gvtKg[mi] ?? null, reps); setGvtKg((k) => ({ ...k, [mi]: null })); }} />
                  </div>
                ) : isCardio(lm.name) ? (
                  <div className="cardio-inputs" style={{ margin: '8px 0' }}>
                    <div className="row" style={{ gap: 8 }}>
                      <label className="form" style={{ flex: 1 }}>
                        Time (min)
                        <input type="number" inputMode="decimal" value={lm.durationMin ?? ''} placeholder="e.g. 30"
                          onChange={(e) => setCardio(mi, { durationMin: e.target.value ? Number(e.target.value) : undefined })} />
                      </label>
                      <label className="form" style={{ flex: 1 }}>
                        Distance (km)
                        <input type="number" inputMode="decimal" step="0.1" value={lm.distanceKm ?? ''} placeholder="e.g. 5"
                          onChange={(e) => setCardio(mi, { distanceKm: e.target.value ? Number(e.target.value) : undefined })} />
                      </label>
                    </div>
                    <p className="muted" style={{ marginTop: 6 }}>
                      {paceLabel(lm.durationMin, lm.distanceKm) ?? 'Avg pace —'}
                      {' · '}
                      {kcalLabel(lm.name, lm.durationMin, bodyKg) ?? 'Calories —'}
                      {bodyKg !== 80 ? ` (at ${bodyKg} kg)` : ' (est. at 80 kg)'}
                      {data.settings.cardioGoal && data.settings.cardioGoal !== 'maintenance' ? ` · Priority: ${data.settings.cardioGoal}` : ''}
                    </p>
                  </div>
                ) : (
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
                )}
                {lm.superset && draft.movements.map((pm, pi) => pi !== mi && pm.superset === lm.superset ? (
                  <div key={pi} className="sets" style={{ marginTop: 10 }}>
                    <div className="row" style={{ margin: '4px 0', justifyContent: 'space-between' }}>
                      <span className="muted">{pm.name}</span>
                      <button className="chip" onClick={() => unlinkOne(pi)}>Unlink</button>
                    </div>
                    <div className="sets-h"><span>Set</span><span>kg</span><span>Reps</span><span /></div>
                    {pm.sets.map((s, si) => (
                      <SetRow key={si} index={si} s={s}
                        hint={{ weight: null, reps: null }}
                        onEdit={(patch) => updateSet(pi, si, patch)}
                        onKind={(k) => setKind(pi, si, k)}
                        onTick={() => updateSet(pi, si, s.done ? { reps: null } : { reps: s.reps ?? null, weight: s.weight ?? null })} />
                    ))}
                  </div>
                ) : null)}
                <div className="mv-foot">
                  <span className="muted">{prev ? `Last: ${prev.sets.filter((x) => x.done).map((x) => `${x.weight ?? '–'}×${x.reps ?? '–'}`).join(', ')}` : 'No previous session'}</span>
                  <div className="mv-actions" style={{ margin: '6px 0 0' }}>
                    <span className="mv-actions-group">
                      <button className="chip" onClick={() => saveDraft(draft.movements.map((m, i) => i === mi ? { ...m, sets: [...m.sets, { reps: null, weight: null, done: false }] } : m))}>+ Set</button>
                      <button className={`chip ${lm.superset ? 'on' : ''}`} onClick={() => startSuperset(mi)}>Superset</button>
                      <button className="chip" onClick={() => saveDraft(draft.movements.filter((_, i) => i !== mi))}>Remove</button>
                    </span>
                    {complete
                      ? <button className="chip" onClick={() => reopenMovement(mi)}>Reopen</button>
                      : <button className="primary" onClick={() => finishMovement(mi)}>Finish</button>}
                  </div>
                  <input className="notes" placeholder="Notes" value={lm.notes ?? ''} onChange={(e) => setMovementNotes(mi, e.target.value)} style={{ marginTop: 8, width: '100%' }} />
                </div>
                </>
                )}
              </article>
            );
          });
          })()}
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
        {onPlan && <button className="ghost" onClick={() => requestFinish('skipped')}>Skip {plan.focus} → next focus</button>}
        
      </div>

      <RestTimer cue={rest} sound={data.settings.sound} vibrate={data.settings.vibrate} />

      {picker && (
        <div className="sheet" onClick={() => setPicker(null)}>
          <div className="sheet-body" onClick={(e) => e.stopPropagation()}>
            <h3>{picker.mode === 'swap' ? 'Swap movement' : 'Add movement'}</h3>
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
    
      
      {ssPick && (
        <div className="sheet" onClick={() => setSsPick(null)}>
          <div className="sheet-body" onClick={(e) => e.stopPropagation()}>
            <h3>Superset</h3>
            <p className="muted">Add movements. They run back-to-back, then you rest. Unlink one if you pick wrong.</p>
            {draft.movements[ssPick.index].superset && (
              <div className="chips" style={{ marginBottom: 8 }}>
                {draft.movements.map((m, i) => m.superset === draft.movements[ssPick.index].superset && i !== ssPick.index ? (
                  <button key={i} className="chip on" onClick={() => unlinkOne(i)}>{m.name} · unlink</button>
                ) : null)}
              </div>
            )}
            <button className="primary wide" onClick={() => setPicker({ mode: 'superset', index: ssPick.index })}>Add a movement</button>
            {draft.movements.some((m, i) => i !== ssPick.index && m.superset !== draft.movements[ssPick.index].superset) && (
              <>
                <p className="muted" style={{ marginTop: 10 }}>Or link one already in the session:</p>
                <div className="chips">
                  {draft.movements.map((m, i) => i === ssPick.index || m.superset === draft.movements[ssPick.index].superset ? null : (
                    <button key={i} className="chip" onClick={() => addToSuperset(ssPick.index, [i])}>{m.name}</button>
                  ))}
                </div>
              </>
            )}
            <div className="row" style={{ marginTop: 12 }}>
              {draft.movements[ssPick.index].superset && <button className="ghost" onClick={() => { unlinkAll(ssPick.index); setSsPick(null); }}>Unlink all</button>}
              <button className="primary" onClick={() => setSsPick(null)}>Done</button>
            </div>
          </div>
        </div>
      )}

      {checkin && (
        <div className="sheet" role="dialog">
          <div className="sheet-body">
            <h3>Weekly check-in</h3>
            <p className="muted">Optional. Skips until next Monday.</p>
            <label className="form">Weight (kg)
              <input inputMode="decimal" value={checkin.weight} onChange={(e) => setCheckin({ ...checkin, weight: e.target.value })} placeholder="optional" />
            </label>
            <label className="form">Energy (1–10)
              <input type="range" min={1} max={10} value={checkin.energy} onChange={(e) => setCheckin({ ...checkin, energy: Number(e.target.value) })} />
              <span>{checkin.energy}</span>
            </label>
            <div className="row">
              <button className={`chip ${checkin.elbow === 'ok' ? 'on' : ''}`} onClick={() => setCheckin({ ...checkin, elbow: 'ok' })}>Elbow ok</button>
              <button className={`chip ${checkin.elbow === 'sore' ? 'on' : ''}`} onClick={() => setCheckin({ ...checkin, elbow: 'sore' })}>Elbow sore</button>
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              <button className="ghost" onClick={skipCheckin}>Skip</button>
              <button className="primary" onClick={saveCheckin}>Save</button>
            </div>
          </div>
        </div>
      )}

    </section>
  );
}

function Picker({ movements, focus, onPick }: { movements: Movement[]; focus: string; onPick: (m: Movement) => void }) {
  const cats = ['Chest', 'Shoulder', 'Back', 'Arm', 'Leg', 'HIIT', 'Crossfit', 'NoGym', 'Conditioning'];
  const [cat, setCat] = useState<string>(focus);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const list = movements.filter((m) => (cat === 'All' || m.focus === cat) && m.name.toLowerCase().includes(q.toLowerCase()));
  const label = cat === 'NoGym' ? 'No Gym' : cat;
  return (
    <>
      <div className="row">
        <input className="search" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
        <div style={{ position: 'relative' }}>
          <button className="chip on" onClick={() => setOpen((v) => !v)}>{label} ▾</button>
          {open && (
            <div className="card" style={{ position: 'absolute', right: 0, top: '110%', zIndex: 5, padding: 8, minWidth: 140 }}>
              <button className="ghost wide" onClick={() => { setCat('All'); setOpen(false); }}>All</button>
              {cats.map((c) => (
                <button key={c} className={`ghost wide ${cat === c ? 'on' : ''}`} onClick={() => { setCat(c); setOpen(false); }}>
                  {c === 'NoGym' ? 'No Gym' : c}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <ul className="pick">
        {list.map((m) => <li key={m.id}><button onClick={() => onPick(m)}>{m.name}<small>{m.focus} · {m.target}</small></button></li>)}
        {!list.length && <li className="muted pad">Nothing matches.</li>}
      </ul>
    </>
  );
}

function short(name: string) {
  return name.split('(')[0].trim().slice(0, 18);
}
