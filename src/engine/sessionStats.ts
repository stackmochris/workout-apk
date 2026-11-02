import { Session, SetEntry } from '../types';

export interface SessionStats {
  durationMin: number | null;
  totalReps: number;
  totalVolume: number;
  failureSets: number;
  dropSets: number;
  workingSets: number;
  prs: { movement: string; weight: number; reps: number }[];
}

function bestSet(sets: SetEntry[]): { weight: number; reps: number } | null {
  const work = sets.filter((s) => s.done && s.reps != null && (s.kind ?? 'working') === 'working');
  if (!work.length) return null;
  return work.reduce(
    (best, s) => {
      const w = s.weight ?? 0;
      const r = s.reps!;
      if (w > best.weight || (w === best.weight && r > best.reps)) return { weight: w, reps: r };
      return best;
    },
    { weight: -1, reps: -1 },
  );
}

export function computeSessionStats(
  session: Pick<Session, 'movements' | 'date'>,
  previous: Session[],
  startedAt?: string,
): SessionStats {
  let totalReps = 0;
  let totalVolume = 0;
  let failureSets = 0;
  let dropSets = 0;
  let workingSets = 0;
  const prs: SessionStats['prs'] = [];

  for (const lm of session.movements) {
    for (const s of lm.sets) {
      if (!s.done || s.reps == null) continue;
      totalReps += s.reps;
      const kind = s.kind ?? 'working';
      if (kind === 'failure') failureSets++;
      else if (kind === 'drop') dropSets++;
      else workingSets++;
      if (kind === 'working' && s.weight != null) totalVolume += s.weight * s.reps;
    }

    const best = bestSet(lm.sets);
    if (!best) continue;

    let prevBest: { weight: number; reps: number } | null = null;
    for (const ps of previous) {
      const m = ps.movements.find((x) => x.movementId === lm.movementId);
      if (!m) continue;
      const b = bestSet(m.sets);
      if (!b) continue;
      if (!prevBest || b.weight > prevBest.weight || (b.weight === prevBest.weight && b.reps > prevBest.reps)) prevBest = b;
    }

    if (!prevBest || best.weight > prevBest.weight || (best.weight === prevBest.weight && best.reps > prevBest.reps)) {
      prs.push({ movement: lm.name, weight: best.weight, reps: best.reps });
    }
  }

  const durationMin = startedAt
    ? Math.max(1, Math.round((new Date(session.date).getTime() - new Date(startedAt).getTime()) / 60000))
    : null;

  return { durationMin, totalReps, totalVolume, failureSets, dropSets, workingSets, prs };
}
