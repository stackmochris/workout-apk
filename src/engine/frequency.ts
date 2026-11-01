import { Session, Movement } from '../types';
import { isWorking } from './progression';

export interface FrequencyResult {
  muscle: string;
  count: number;
  wasSubMax: boolean;
  wasTop: boolean;
  message: string | null;
}

const GROUP_MAP: Record<string, string[]> = {
  push: ['Chest', 'Shoulder', 'Arm'],
  pull: ['Back', 'Arm'],
  legs: ['Leg'],
};

function weekStart(d: Date) {
  const x = new Date(d);
  const day = x.getDay();
  const diff = x.getDate() - day + (day === 0 ? -6 : 1);
  x.setDate(diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function checkFrequency(
  sessions: Session[],
  movements: Movement[],
  target: string,
  threshold: number,
  now = new Date(),
): FrequencyResult {
  const start = weekStart(now);
  const byId = new Map(movements.map((m) => [m.id, m]));
  const hits: Session[] = [];

  for (const s of sessions) {
    if (s.status !== 'completed' || new Date(s.date) < start) continue;
    const relevant = s.movements.some((lm) => {
      const mv = byId.get(lm.movementId);
      if (!mv) return false;
      if (mv.focus === target) return true;
      const groups = GROUP_MAP[target.toLowerCase()];
      return groups?.includes(mv.focus);
    });
    if (relevant) hits.push(s);
  }

  const count = hits.length;
  if (count < threshold) return { muscle: target, count, wasSubMax: false, wasTop: false, message: null };

  let subMax = 0;
  let top = 0;
  for (const s of hits) {
    for (const lm of s.movements) {
      const mv = byId.get(lm.movementId);
      if (!mv || (mv.focus !== target && !GROUP_MAP[target.toLowerCase()]?.includes(mv.focus))) continue;
      const work = lm.sets.filter(isWorking);
      if (!work.length) continue;
      const maxReps = Math.max(...work.map((x) => x.reps ?? 0));
      if (mv.repMax != null && maxReps >= mv.repMax) top++;
      else subMax++;
    }
  }

  const wasSubMax = subMax > top;
  const wasTop = top > subMax;
  let message: string | null = null;

  if (wasSubMax) {
    message = `Your last ${count} ${target.toLowerCase()} sessions stayed sub-max. If this is your last one this week, consider pushing the weight up.`;
  } else if (wasTop) {
    message = `Your last ${count} ${target.toLowerCase()} sessions hit the top of the range. To help recovery, try a sub-max weight and add a rep or two.`;
  } else {
    message = `You've hit ${target.toLowerCase()} ${count} times this week. Check the earlier sets before adding more load.`;
  }

  return { muscle: target, count, wasSubMax, wasTop, message };
}
