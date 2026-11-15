import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { completeSession, currentPlan, preview, skipSession } from '../engine/rotation';
import { DEFAULT_DAY, FLAG_INFO, SWAP_DEFAULTS } from '../data/movements';
import { penalisedHint, penaltyState } from '../engine/week';
import { syncBody, syncSession } from '../lib/cloudSync';
import { auth } from '../lib/firebase';
import { AppData, previousFor, uid } from '../lib/store';
import { syncDisplayName } from '../lib/sync';
import { BodyEntry, LoggedMovement, Movement, Session, SetKind, UserPrefs } from '../types';
import RestTimer from '../components/RestTimer';
import SetRow from '../components/SetRow';
import { suggestNext, suggestDrop } from '../engine/progression';
import { plateLabel, plateLoad } from '../engine/plates';
import { checkinFastedDefault, muscleFatigue, recoveryHint } from '../engine/analytics';
import { MUSCLES } from '../data/muscles';
import { buzz } from '../lib/audio';
import GvtTimer from '../components/GvtTimer';
import SwapSession from '../components/SwapSession';
import NumInput from '../components/NumInput';
import { editSet } from '../engine/sets';
import { blockLabel, blocks, doneSets, logBlock } from '../engine/gvt';
import { FOCI, Focus, SessionType } from '../types';
import FinishExportPrompt from '../components/FinishExportPrompt';
import FinishSheet from '../components/FinishSheet';
import { computeSessionStats, SessionStats } from '../engine/sessionStats';
import { displayTarget } from '../engine/prescription';
import { addLibraryMovement, memberIndexes, mergeMovement, moveBlock, movementsToRecord, removeGroup, removeMovement, setMark, supersetLetter, unlinkAll, unlinkMovement } from '../engine/superset';
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

type Props = { data: AppData; setData: React.Dispatch<React.SetStateAction<AppData>>; prefs?: UserPrefs; onHistory?: () => void };

function blank(m: Movement): LoggedMovement {
  return { movementId: m.id, name: m.name, sets: Array.from({ length: m.sets || 3 }, () => ({ reps: null, weight: null, done: false })) };
}

export default function Today({ data, setData, onHistory }: Props) {
  const planned = currentPlan(data.rotation);
  const [browse, setBrowse] = useState<{ focus: Focus; type: SessionType } | null>(null);
  const activeDraft = data.draft?.startedAt ? data.draft : null;
  const [receipt, setReceipt] = useState<{ session: Session; stats: SessionStats } | null>(null);
  const plan = activeDraft ? { ...planned, focus: activeDraft.focus as Focus, type: activeDraft.type as SessionType } : browse ? { ...planned, ...browse } : planned;
  const onPlan = plan.focus === planned.focus && plan.type === planned.type;
  const [gvtKg, setGvtKg] = useState<Record<number, number | null>>({});
  const byId = useMemo(() => new Map(data.movements.map((m) => [m.id, m])), [data.movements]);
  const [picker, setPicker] = useState<{ mode: 'add' | 'swap'; index?: number } | null>(null);
  const [ssPick, setSsPick] = useState<{ index: number } | null>(null);
  const [swapping, setSwapping] = useState(false);
  const [finish, setFinish] = useState<{ session: Session; stats: SessionStats } | null>(null);
  const [sheetPrompt, setSheetPrompt] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const workoutSection = useRef<HTMLElement>(null);
  const nextInput = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!nextInput.current) return;
    const input = workoutSection.current?.querySelector<HTMLInputElement>(nextInput.current);
    nextInput.current = null;
    input?.focus();
    input?.select();
  });
  const currentCard = useRef<HTMLElement>(null);
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});
  const [checkin, setCheckin] = useState<{ weight: string; energy: number; elbow: 'ok' | 'sore'; fasted: boolean } | null>(null);
  const [, setTick] = useState(0);
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

  const checkinWeek = new Date();
  checkinWeek.setDate(checkinWeek.getDate() - (checkinWeek.getDay() + 6) % 7);
  checkinWeek.setHours(0, 0, 0, 0);
  const checkinDue = !data.body.some((entry) => new Date(entry.date) >= checkinWeek)
    && sessionStorage.getItem('checkin-skipped') !== checkinWeek.toISOString().slice(0, 10);

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
    setData((d) => ({ ...d, draft: { ...draft, movements, lastInputAt: new Date().toISOString(), ...extra } }));
  
  const setMovementNotes = (mi: number, notes: string) =>
    saveDraft(draft.movements.map((m, i) => i === mi ? { ...m, notes: notes || undefined } : m));

  const setCardio = (mi: number, patch: { durationMin?: number; distanceKm?: number }) => {
    const now = new Date().toISOString();
    saveDraft(draft.movements.map((m, i) => i === mi ? { ...m, ...patch, performedAt: m.performedAt ?? now } : m));
  };

  const finishMovement = (mi: number) => {
    const ids = new Set(memberIndexes(draft.movements, mi));
    saveDraft(draft.movements.map((m, i) => ids.has(i) ? { ...m, finished: true } : m));
    setCollapsed((c) => ({ ...c, [mi]: true }));
  };
  const saveCheckin = () => {
    if (!checkin) return;
    const entry: BodyEntry = {
      id: uid(), date: new Date().toISOString(),
      weight: checkin.weight ? Number(checkin.weight) : undefined,
      energy: checkin.energy, elbow: checkin.elbow, fasted: checkin.fasted,
      author: 'app', updatedAt: new Date().toISOString(),
    };
    setData((d) => ({ ...d, body: [...d.body, entry] }));
    syncBody(entry);
    setCheckin(null);
  };
  const skipCheckin = () => {
    const x = new Date(); const day = x.getDay(); const diff = x.getDate() - day + (day === 0 ? -6 : 1); x.setDate(diff);
    sessionStorage.setItem('checkin-skipped', x.toISOString().slice(0, 10));
    setCheckin(null);
  };

  const reopenMovement = (mi: number) => {
    const ids = new Set(memberIndexes(draft.movements, mi));
    saveDraft(draft.movements.map((m, i) => ids.has(i) ? { ...m, finished: false } : m));
    setCollapsed((c) => ({ ...c, [mi]: false }));
  };

  const addRound = (mi: number) => {
    const ids = new Set(memberIndexes(draft.movements, mi));
    saveDraft(draft.movements.map((m, i) => ids.has(i) ? { ...m, sets: [...m.sets, { reps: null, weight: null, done: false }] } : m));
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

  const updateSet = (mi: number, si: number, patch: Parameters<typeof editSet>[1]) => {
    const old = draft.movements[mi].sets[si];
    const updated = editSet(old, patch);
    const logged = updated.done && !old.done;
    const movement = draft.movements[mi];
    const stamp = new Date().toISOString();
    const movements = draft.movements.map((m, i) => i !== mi ? m : {
      ...m,
      performedAt: m.performedAt ?? (logged ? stamp : undefined),
      sets: m.sets.map((set, j) => j === si ? updated : set),
    });
    const round = movement.superset ? memberIndexes(movements, mi) : [mi];
    const partner = round.find((i) => movements[i].sets[si] && !movements[i].sets[si].done);
    if (logged) {
      const next = round.flatMap((i) => {
        const set = movements[i].sets.findIndex((entry) => !entry.done);
        return set < 0 ? [] : [{ i, set }];
      }).sort((a, b) => a.set - b.set)[0];
      if (next) {
        setCollapsed((state) => ({ ...state, [round[0]]: false }));
        nextInput.current = `[data-set-row="${next.i}-${next.set}"] input`;
      } else {
        nextInput.current = '.mv.active .current-set input, .mv.active .gvt-start input, .mv.active .cardio-inputs input';
      }
    }
    const rest = logged && partner == null && data.settings.restSeconds > 0
      ? { endAt: Date.now() + data.settings.restSeconds * 1000, seconds: data.settings.restSeconds }
      : old.done && !updated.done ? undefined : data.draft?.rest;
    saveDraft(movements, { startedAt: draft.startedAt ?? stamp, rest });
    if (logged && data.settings.vibrate) buzz(40);
  };

  const setKind = (mi: number, si: number, kind: SetKind) =>
    saveDraft(draft.movements.map((m, i) => i !== mi ? m : { ...m, sets: m.sets.map((x, j) => j === si ? { ...x, kind: kind === 'working' ? undefined : kind } : x) }));

  const openSuperset = (mi: number) => setSsPick({ index: mi });

  const joinExisting = (partnerIndex: number) => {
    if (!ssPick) return;
    const result = mergeMovement(draft.movements, ssPick.index, partnerIndex, uid());
    saveDraft(result.movements);
    setSsPick({ index: result.anchorIndex });
  };

  const joinLibrary = (m: Movement) => {
    if (!ssPick) return;
    const result = addLibraryMovement(draft.movements, ssPick.index, blank(m), uid());
    saveDraft(result.movements);
    setSsPick({ index: result.anchorIndex });
  };

  const unlinkAt = (index: number) => saveDraft(unlinkMovement(draft.movements, index));

  const unlinkGroup = (index: number) => {
    saveDraft(unlinkAll(draft.movements, index));
    setSsPick(null);
  };

  const requestFinish = (status: Session['status'], extra: Partial<Session> = {}) => {
    const now = new Date().toISOString();
    const session: Session = {
      id: uid(), date: now, focus: plan.focus, type: plan.type, status,
      movements: status === 'completed' ? movementsToRecord(draft.movements.map((m) => ({ ...m, sets: m.sets.filter((set) => set.done) })), { keepAll: !!extra.gvtRepsPerMinute }) : [],
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
    setGvtKg({});
    setBrowse(null);
    setCollapsed({});
    setSwapping(false);
    setFinish(null);
    if (session.status === 'completed') {
      syncSession(session, syncDisplayName(data.settings.displayName, auth?.currentUser?.displayName, auth?.currentUser?.email));
    }
    if (session.status === 'completed') setReceipt({ session, stats: computeSessionStats(session, data.sessions, draft.startedAt) });
  };

  const logGvt = (mi: number, weight: number | null, reps: number[]) => {
    if (!reps.length) return;
    if (!draft.startedAt) saveDraft(draft.movements.map((m, i) => (i === mi ? logBlock(m, weight, reps) : m)), { startedAt: new Date().toISOString() });
    else saveDraft(draft.movements.map((m, i) => (i === mi ? logBlock(m, weight, reps) : m)));
  };

  const pick = (m: Movement) => {
    if (!picker) return;
    if (picker.mode === 'add') saveDraft([...draft.movements, blank(m)]);
    else if (picker.index != null) {
      const original = draft.movements[picker.index];
      const logged = original.sets.filter((set) => set.done);
      const replacement = { ...blank(m), superset: original.superset };
      if (logged.length || original.durationMin || original.distanceKm) {
        const remaining = Math.max(1, original.sets.length - logged.length);
        replacement.sets = Array.from({ length: remaining }, () => ({ reps: null, weight: null, done: false }));
        saveDraft(draft.movements.flatMap((entry, i) => i !== picker.index ? [entry] : [
          { ...original, sets: logged, finished: true, superset: undefined }, replacement,
        ]));
      } else {
        saveDraft(draft.movements.map((entry, i) => i === picker.index ? replacement : entry));
      }
    }
    setPicker(null);
    setCollapsed({});
  };

  const next = preview(data.rotation, 4).slice(1);
  const fatigue = useMemo(() => muscleFatigue(data.sessions, data.movements), [data.sessions, data.movements]);
  const tired = recoveryHint(plan.focus, fatigue);
  const label = (id: string) => MUSCLES.find((m) => m.id === id)?.label ?? id;
  const bodyKg = [...data.body].reverse().find((b) => b.weight)?.weight ?? 80;

  const movementFacts = (lm: LoggedMovement) => {
    const mv = byId.get(lm.movementId);
    const prev = previousFor(data.sessions, lm.movementId);
    const flagged = !!mv?.flags.length;
    const sug = mv
      ? suggestNext(mv, prev?.sets, { bar: data.settings.barKg, plates: data.settings.plates, extraReps: pen.elbowReps })
      : { weight: null as number | null, reps: null as number | null, reason: 'none' as const };
    const sugP = penalisedHint(mv, { weight: sug.weight, reps: sug.reps }, penalty.multiplier, pen);
    const isPr = beats(bestWorking(lm.sets), prev ? bestWorking(prev.sets) : null);
    return { mv, prev, flagged, sug, sugP, isPr };
  };

  const renderWork = (lm: LoggedMovement, mi: number, mark?: (setIndex: number) => string) => {
    const { mv, prev, flagged, sug, sugP } = movementFacts(lm);
    return (
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
        <p className="muted small">{lastLabel(prev)}</p>
        {sug.reason !== 'none' && (
          <p className="suggest">
            <b>Suggested: {sugP.weight != null ? `${sugP.weight} kg \u00d7 ` : ''}{sugP.reps}</b>
            <span>{sug.reason === 'add-weight' ? 'Top of range hit. Add weight' : sug.reason === 'add-reps' ? 'Add a rep' : 'Repeat'}{sugP.addedKg || sugP.addedReps ? ' (incl. penalty)' : ''}</span>
            {mv?.equipment === 'barbell' && sugP.weight != null && <span className="plates">{plateLabel(plateLoad(sugP.weight, data.settings.barKg, data.settings.plates))}</span>}
          </p>
        )}
        {flagged && mv!.flags.map((f) => <p key={f} className="flag">{'\u26a0'} {FLAG_INFO[f]?.reminder ?? f}</p>)}
        {mv?.notes && <p className="muted small">{mv.notes}</p>}
        {lm.gvt ? (
          <div className="gvt-work">
            {blocks(lm.sets).length > 0 && (
              <p className="muted" style={{ margin: '4px 0 8px' }}>
                {doneSets(lm)}/{data.settings.gvt.sets} sets logged · {blocks(lm.sets).map(blockLabel).join(' · ')}
                {doneSets(lm) < data.settings.gvt.sets && ` · Next set: ${doneSets(lm) + 1}`}
              </p>
            )}
            <div className="gvt-start" data-gvt-weight={mi} style={{ marginBottom: 8 }}>
              <NumInput kind="kg" label={`${lm.name} kg`} value={gvtKg[mi] ?? null}
                placeholder={(() => { const p = previousFor(data.sessions, lm.movementId); const w = p ? [...p.sets].reverse().find((x) => x.done && x.weight != null)?.weight : undefined; return w != null ? String(w) : 'kg'; })()}
                onChange={(n) => setGvtKg((k) => ({ ...k, [mi]: n }))} />
            </div>
            <GvtTimer key={`${mi}-${doneSets(lm)}`} {...data.settings.gvt} sound={data.settings.sound} vibrate={data.settings.vibrate}
              startAt={doneSets(lm)} weight={gvtKg[mi] ?? null}
              onFinish={(reps, weight) => { logGvt(mi, weight, reps); setGvtKg((k) => ({ ...k, [mi]: null })); }}
              onAdjust={(reps, weight) => {
                nextInput.current = `[data-gvt-weight="${mi}"] input`;
                logGvt(mi, weight, reps);
                setGvtKg((k) => ({ ...k, [mi]: null }));
              }} />
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
              const setLabel = mark?.(si);
              return (
                <Fragment key={si}>
                  <SetRow rowId={`${mi}-${si}`} index={si} s={s} hint={p} label={setLabel} current={!s.done && lm.sets.findIndex((set) => !set.done) === si}
                    onEdit={(patch) => updateSet(mi, si, patch)}
                    onKind={(k) => setKind(mi, si, k)}
                    onTick={() => updateSet(mi, si, s.done ? { done: false } : { done: true, reps: s.reps ?? p.reps ?? null, weight: s.weight ?? p.weight ?? null })} />
                  {dropHint?.end != null && s.dropEnd == null && (
                    <p className="muted small" style={{ margin: '2px 0 6px 44px' }}>Drop to ~{dropHint.end} kg{dropHint.dropKg ? ` (\u2212${dropHint.dropKg} kg)` : ''}</p>
                  )}
                </Fragment>
              );
            })}
          </div>
        )}
      </>
    );
  };

  const inSession = !!draft.startedAt;
  const hasLoggedWork = draft.movements.some((m) => m.sets.some((set) => set.done) || m.durationMin || m.distanceKm);
  const discardEmptyWorkout = () => {
    if (!confirm('Discard this workout draft?')) return;
    setData((d) => ({ ...d, draft: null }));
    setSwapping(false);
    setCollapsed({});
    setGvtKg({});
  };
  const movementDone = (m: LoggedMovement) => !!m.finished || (m.gvt
    ? doneSets(m) >= data.settings.gvt.sets
    : isCardio(m.name)
      ? !!(m.durationMin || m.distanceKm)
      : m.sets.length > 0 && m.sets.every((set) => set.done));
  const doneCount = draft.movements.filter(movementDone).length;
  const currentIndex = draft.movements.findIndex((m) => !movementDone(m));
  useEffect(() => {
    if (inSession && currentIndex >= 0) currentCard.current?.scrollIntoView({ block: 'nearest' });
  }, [inSession, currentIndex]);
  const current = draft.movements[currentIndex];
  const partners = current ? memberIndexes(draft.movements, currentIndex) : [];
  const nextRound = partners.flatMap((i, member) => {
    const si = draft.movements[i].sets.findIndex((set) => !set.done);
    return si < 0 || draft.movements[i].finished ? [] : [{ i, si, mark: setMark(member, si) }];
  }).sort((a, b) => a.si - b.si)[0];
  const idleSince = draft.lastInputAt ?? draft.startedAt;
  const interrupted = !!idleSince && Date.now() - Date.parse(idleSince) > 5 * 3600_000;
  const nextLabel = swapping ? 'Bodyweight workout' : nextRound && partners.length > 1
    ? `Next: ${nextRound.mark} · ${draft.movements[nextRound.i].name}`
    : current ? `Next: ${current.name}` : 'All exercises complete';

  return (
    <section ref={workoutSection} className={inSession ? 'workout-session' : 'workout-preview'}>
      <header className={inSession ? 'session-heading' : `hero ${plan.type === 'GVT' ? 'gvt-day' : ''}`}>
        <small>{inSession ? 'Workout in progress' : onPlan ? 'Today' : 'Workout preview'}</small>
        <h1>{plan.focus === 'NoGym' ? 'No Gym' : plan.focus} <span>· {plan.type}</span></h1>
        <p className="nums">{inSession ? `${elapsedLabel} · ${doneCount}/${draft.movements.length} exercises` : `Cycle ${plan.cycleStep}/3 · ${draft.movements.length} exercises`}</p>
        {inSession && onHistory && <button className="ghost" onClick={onHistory}>History</button>}
      </header>
      {inSession && interrupted && <div className="card">
        <strong>Workout paused</strong>
        <p>Your draft is saved. {onPlan ? 'Saving a partial workout advances your rotation.' : 'This workout leaves your rotation in place.'}</p>
        <div className="row">
          <button className="primary" onClick={() => saveDraft(draft.movements)}>Resume workout</button>
          {hasLoggedWork
            ? <button className="ghost" onClick={() => requestFinish('completed')}>Save partial workout</button>
            : <button className="ghost" onClick={discardEmptyWorkout}>Discard draft</button>}
        </div>
      </div>}
      {inSession && <details className="session-plan">
        <summary>View upcoming plan</summary>
        <p className="muted">{next.map((n) => `${n.focus} · ${n.type}`).join(' → ')}</p>
      </details>}
      {!inSession && (
        <div className="card plan">
          <ul className="preview-list">{draft.movements.map((m, i) => <li key={i}>{m.name}</li>)}</ul>
          <button className="primary wide" onClick={startTimer}>Start workout</button>
          {checkinDue && <button className="ghost wide" onClick={() => setCheckin({ weight: '', energy: 5, elbow: 'ok', fasted: checkinFastedDefault() })}>Weekly check-in</button>}
          <details>
            <summary>View plan</summary>
            <label className="form">Preview a focus
              <select value={plan.focus} onChange={(e) => {
                const focus = e.target.value as Focus;
                setBrowse(focus === planned.focus ? null : { focus, type: planned.type });
              }}>
                {FOCI.map((focus) => <option key={focus}>{focus}</option>)}
              </select>
            </label>
            {!onPlan && <p className="muted small">This workout leaves your rotation in place.</p>}
            <p className="next">Up next: {next.map((n) => `${n.focus} · ${n.type}`).join(' → ')}</p>
            {onPlan && <button className="ghost" onClick={() => requestFinish('skipped')}>Skip {plan.focus} → next focus</button>}
            <button className="ghost" onClick={() => { startTimer(); setSwapping(true); }}>Bodyweight workout</button>
          </details>
        </div>
      )}
      {tired.length > 0 && !inSession && <p className="recovery">Recovery reminder: {tired.map(label).join(', ')}.</p>}

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

      {inSession && (swapping ? (
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
          const indexed = draft.movements.map((lm, mi) => ({
            lm, mi,
            complete: memberIndexes(draft.movements, mi).every((i) => movementDone(draft.movements[i])),
          }));
          return indexed.filter(({ lm, mi }) => {
            if (!lm.superset) return true;
            const first = draft.movements.findIndex((m) => m.superset === lm.superset);
            return first === mi;
          }).map(({ lm, mi, complete }) => {
            const groupIdx = memberIndexes(draft.movements, mi);
            const isGroup = !!(lm.superset && groupIdx.length > 1);
            const facts = groupIdx.map((i) => movementFacts(draft.movements[i]));
            const { mv, prev } = facts[0];
            const isPr = facts.some((f) => f.isPr);
            const flagged = facts.some((f) => f.flagged);
            const active = !complete && groupIdx.includes(currentIndex);
            const outsideBefore = groupIdx[0] > 0;
            const outsideAfter = draft.movements.some((m, i) => i > groupIdx[0] && !(lm.superset && m.superset === lm.superset));
            const names = groupIdx.map((i) => draft.movements[i].name).join(' + ');
            return (
              <article ref={active ? currentCard : undefined} key={isGroup ? `ss-${lm.superset}` : mi} className={`card mv ${complete ? 'complete' : active ? 'active' : ''} ${isPr ? 'pr' : ''} ${flagged ? 'flagged' : ''} ${isGroup ? 'superset' : ''}`}>
                {isGroup && <span className="ss-tag">Superset</span>}
                <div className="mv-head">
                  <button className="exercise-toggle" aria-expanded={collapsed[mi] === false || (active && collapsed[mi] !== true)}
                    onClick={() => setCollapsed((c) => ({ ...c, [mi]: c[mi] === false || (active && c[mi] !== true) }))}>
                    {complete ? '✓' : '▾'}<span className="sr-only"> Toggle {names}</span>
                  </button>
                  <div>
                    <h3>
                      <span>{isGroup ? names : lm.name}</span>
                      {!isGroup && facts[0].isPr && <span className="pr-pill">PR</span>}
                    </h3>
                    <small>
                      {isGroup
                        ? 'Alternate A1 then B1, then rest. Each movement logs on its own.'
                        : <>{mv ? displayTarget(mv, data.settings.goal, data.settings.prescriptions?.[mv.id]) : ''}{prev?.notes ? ` · Last: ${prev.notes}` : ''}</>}
                    </small>
                  </div>
                </div>
                {collapsed[mi] === false || (active && collapsed[mi] !== true) ? (
                <>
                <div className="mv-actions">
                  {!isGroup && <button className="chip" onClick={() => setPicker({ mode: 'swap', index: mi })}>Swap exercise</button>}
                  <details className="exercise-menu">
                    <summary>Exercise options</summary>
                    <div className="mv-actions-group">
                    <button className="icon" disabled={!outsideBefore} onClick={() => saveDraft(moveBlock(draft.movements, mi, -1))} aria-label="Move up">↑</button>
                    <button className="icon" disabled={!outsideAfter} onClick={() => saveDraft(moveBlock(draft.movements, mi, 1))} aria-label="Move down">↓</button>
                      {!isGroup && <button className={`chip ${lm.gvt ? 'on' : ''}`} onClick={() => saveDraft(draft.movements.map((m, i) => i === mi ? { ...m, gvt: !m.gvt } : m))}>GVT mode</button>}
                      <button className="chip" onClick={() => {
                        const hasWork = groupIdx.some((i) => draft.movements[i].sets.some((set) => set.done)
                          || draft.movements[i].durationMin || draft.movements[i].distanceKm);
                        if (!hasWork || confirm('Remove this exercise and its logged work?')) {
                          saveDraft(isGroup ? removeGroup(draft.movements, mi) : removeMovement(draft.movements, mi));
                          setCollapsed({});
                        }
                      }}>{isGroup ? 'Remove group' : 'Remove exercise'}</button>
                    </div>
                  </details>
                </div>
                {isGroup ? (
                  <div className="ss-members">
                    {groupIdx.map((i, idx) => {
                      const m = draft.movements[i];
                      const f = facts[idx];
                      return (
                        <div className="ss-member" key={i}>
                          <div className="ss-member-head">
                            <div>
                              <h3>
                                <span className="ss-letter">{supersetLetter(idx)}</span>
                                <span>{m.name}</span>
                                {f.isPr && <span className="pr-pill">PR</span>}
                              </h3>
                              <small>{f.mv ? displayTarget(f.mv, data.settings.goal, data.settings.prescriptions?.[f.mv.id]) : ''}{f.prev?.notes ? ` · Last: ${f.prev.notes}` : ''}</small>
                            </div>
                            <span className="ss-actions">
                              <button className={`chip ${m.gvt ? 'on' : ''}`} onClick={() => saveDraft(draft.movements.map((x, n) => n === i ? { ...x, gvt: !x.gvt } : x))}>GVT</button>
                              <button className="chip" onClick={() => setPicker({ mode: 'swap', index: i })}>Swap</button>
                              <button className="chip" onClick={() => unlinkAt(i)}>Unlink</button>
                              <button className="chip" onClick={() => {
                                if (!m.sets.some((set) => set.done) || confirm('Remove this exercise and its logged work?')) {
                                  saveDraft(removeMovement(draft.movements, i));
                                  setCollapsed({});
                                }
                              }}>Remove</button>
                            </span>
                          </div>
                          {renderWork(m, i, (si) => setMark(idx, si))}
                          <input className="notes" placeholder="Notes" value={m.notes ?? ''} onChange={(e) => setMovementNotes(i, e.target.value)} style={{ marginTop: 8, width: '100%' }} />
                        </div>
                      );
                    })}
                  </div>
                ) : renderWork(lm, mi)}
                <div className="mv-foot">
                  <div className="mv-actions" style={{ margin: '6px 0 0' }}>
                    <span className="mv-actions-group">
                      <button className="chip" onClick={() => addRound(mi)}>+ Set</button>
                      <button className={`chip ${isGroup ? 'on' : ''}`} onClick={() => openSuperset(mi)}>Superset</button>
                    </span>
                    {complete
                      ? <button className="chip" onClick={() => reopenMovement(mi)}>Reopen</button>
                      : <button className="ghost" onClick={() => finishMovement(mi)}>Finish exercise</button>}
                  </div>
                  {!isGroup && <input className="notes" placeholder="Notes" value={lm.notes ?? ''} onChange={(e) => setMovementNotes(mi, e.target.value)} style={{ marginTop: 8, width: '100%' }} />}
                </div>
                </>
                ) : null}
              </article>
            );
          });
          })()}
          {draft.movements.length === 0 && (
            <div className="empty">
              <h3>Freestyle</h3>
              <p>No movements yet. Add what you want to do today.</p>
            </div>
          )}
          <button className="ghost wide" onClick={() => setPicker({ mode: 'add' })}>+ Add movement</button>
        </>
      ))}
      {inSession && (
        <div className="session-bar">
          <RestTimer cue={draft.rest} onChange={(rest) => saveDraft(draft.movements, { rest })}
            sound={data.settings.sound} vibrate={data.settings.vibrate} />
          <div className="session-bar-actions">
            <span>{nextLabel}</span>
            {!swapping && (hasLoggedWork
              ? <button className="ghost" onClick={() => requestFinish('completed')}>Finish workout</button>
              : <button className="ghost" onClick={discardEmptyWorkout}>Discard draft</button>)}
          </div>
        </div>
      )}

      {picker && (
        <div className="sheet" onClick={() => setPicker(null)}>
          <div className="sheet-body" onClick={(e) => e.stopPropagation()}>
            <h3>{picker.mode === 'swap' ? 'Swap movement' : 'Add movement'}</h3>
            <Picker movements={data.movements} focus={plan.focus} onPick={pick}
              original={picker.index == null ? undefined : byId.get(draft.movements[picker.index].movementId)} />
          </div>
        </div>
      )}

      {finish && (
        <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="finish-workout">
          <div className="sheet-body">
            <h3 id="finish-workout">Save workout?</h3>
            <p>{finish.session.movements.reduce((sum, m) => sum + m.sets.filter((set) => set.done).length, 0)} logged sets</p>
            {current && <p className="muted">Some exercises are unfinished. {onPlan ? 'Saving advances your rotation.' : 'Your rotation stays in place.'}</p>}
            <div className="row">
              <button className="ghost" onClick={() => setFinish(null)}>Keep logging</button>
              <button className="primary" onClick={() => commitSession(finish.session)}>Save workout</button>
            </div>
          </div>
        </div>
      )}
      {receipt && !sheetPrompt && (
        <FinishSheet stats={receipt.stats} focus={receipt.session.focus} type={receipt.session.type}
          onClose={() => setReceipt(null)} onExport={() => setSheetPrompt(receipt.session.id)} />
      )}

      {ssPick && draft.movements[ssPick.index] && (
        <SupersetPicker
          anchorIndex={ssPick.index}
          movements={draft.movements}
          library={data.movements}
          focus={plan.focus}
          onJoinExisting={joinExisting}
          onJoinLibrary={joinLibrary}
          onUnlink={unlinkAt}
          onUnlinkAll={() => unlinkGroup(ssPick.index)}
          onClose={() => setSsPick(null)}
        />
      )}

      {checkin && (
        <div className="sheet" role="dialog">
          <div className="sheet-body">
            <h3>Weekly check-in</h3>
            <p className="muted">Optional. Skips until next Monday.</p>
            <label className="form">Weight (kg)
              <input inputMode="decimal" value={checkin.weight} onChange={(e) => setCheckin({ ...checkin, weight: e.target.value })} placeholder="optional" />
            </label>
            <label className="fasted-check">
              <input type="checkbox" checked={checkin.fasted} onChange={(e) => setCheckin({ ...checkin, fasted: e.target.checked })} />
              Fasted
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

      {sheetPrompt && (
        <FinishExportPrompt
          key={sheetPrompt}
          sessions={data.sessions}
          body={data.body}
          onDismiss={() => setSheetPrompt(null)}
        />
      )}

    </section>
  );
}

function SupersetPicker({ anchorIndex, movements, library, focus, onJoinExisting, onJoinLibrary, onUnlink, onUnlinkAll, onClose }: {
  anchorIndex: number;
  movements: LoggedMovement[];
  library: Movement[];
  focus: string;
  onJoinExisting: (index: number) => void;
  onJoinLibrary: (m: Movement) => void;
  onUnlink: (index: number) => void;
  onUnlinkAll: () => void;
  onClose: () => void;
}) {
  const anchor = movements[anchorIndex];
  const grouped = anchor.superset
    ? movements.flatMap((m, i) => (m.superset === anchor.superset ? [{ m, i }] : []))
    : [];
  const others = movements.flatMap((m, i) => {
    if (i === anchorIndex) return [];
    if (anchor.superset && m.superset === anchor.superset) return [];
    return [{ m, i }];
  });
  return (
    <div className="sheet" onClick={onClose}>
      <div className="sheet-body" onClick={(e) => e.stopPropagation()}>
        <h3>Superset</h3>
        <p className="muted">Pair {anchor.name} with another movement. Sets alternate A1, B1, and each one logs on its own.</p>
        {grouped.length > 1 && (
          <>
            <h4>In this superset</h4>
            <ul className="pick">
              {grouped.map(({ m, i }) => (
                <li key={i}>
                  <div className="row" style={{ justifyContent: 'space-between', margin: 0 }}>
                    <span>{i === anchorIndex ? `${m.name} · this one` : m.name}</span>
                    <button className="chip" onClick={() => onUnlink(i)}>Unlink</button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
        <h4>In this workout</h4>
        {others.length ? (
          <ul className="pick">
            {others.map(({ m, i }) => {
              const logged = m.sets.filter((s) => s.done).length;
              return (
                <li key={i}>
                  <button onClick={() => onJoinExisting(i)}>
                    {m.name}
                    <small>{logged ? `${logged} set${logged === 1 ? '' : 's'} logged · moves onto this card` : 'Already in today · add to this card'}</small>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : <p className="muted">No other movements in today&apos;s workout.</p>}
        <h4>Add from library</h4>
        <Picker movements={library} focus={focus} onPick={onJoinLibrary} />
        <div className="row" style={{ marginTop: 12 }}>
          {grouped.length > 1 && <button className="ghost" onClick={onUnlinkAll}>Unlink all</button>}
          <button className="primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

function Picker({ movements, focus, onPick, original }: { movements: Movement[]; focus: string; onPick: (m: Movement) => void; original?: Movement }) {
  const cats = ['Chest', 'Shoulder', 'Back', 'Arm', 'Leg', 'HIIT', 'Crossfit', 'NoGym', 'Conditioning'];
  const [cat, setCat] = useState<string>(original?.focus ?? focus);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const similarity = (m: Movement) => Number(!!original?.target && m.target === original.target) * 2
    + Number(!!original && m.focus === original.focus);
  const list = movements.filter((m) => m.id !== original?.id && (cat === 'All' || m.focus === cat)
    && m.name.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => similarity(b) - similarity(a));
  const label = cat === 'NoGym' ? 'No Gym' : cat;
  return (
    <>
      <div className="row">
        <input className="search" aria-label="Search exercises" placeholder="Search exercises" value={q} onChange={(e) => setQ(e.target.value)} />
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
        {!list.length && <li className="empty"><h3>Nothing matches</h3><p>Try another search or category.</p></li>}
      </ul>
    </>
  );
}

function lastLabel(prev: LoggedMovement | undefined) {
  if (!prev) return 'No previous session';
  const done = prev.sets.filter((x) => x.done);
  if (!done.length) return 'No previous session';
  return `Last: ${done.map((x) => `${x.weight ?? '–'}×${x.reps ?? '–'}`).join(', ')}`;
}

function short(name: string) {
  return name.split('(')[0].trim().slice(0, 18);
}

function bestWorking(sets: LoggedMovement['sets']) {
  let best: { weight: number; reps: number } | null = null;
  for (const s of sets) {
    if (!s.done || s.reps == null || (s.kind ?? 'working') !== 'working') continue;
    const weight = s.weight ?? 0;
    if (!best || weight > best.weight || (weight === best.weight && s.reps > best.reps)) best = { weight, reps: s.reps };
  }
  return best;
}

function beats(cur: { weight: number; reps: number } | null, prev: { weight: number; reps: number } | null) {
  if (!cur) return false;
  if (!prev) return true;
  return cur.weight > prev.weight || (cur.weight === prev.weight && cur.reps > prev.reps);
}
