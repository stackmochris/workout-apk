import { FOCI, Focus, RotationState, SessionType } from '../types';

/** Each focus cycles Normal → Normal → GVT, then resets. */
export const CYCLE: SessionType[] = ['Normal', 'Normal', 'GVT'];

export function initialRotation(order: Focus[] = FOCI): RotationState {
  const counters = Object.fromEntries(order.map((f) => [f, 0])) as Record<Focus, number>;
  return { order: [...order], nextIndex: 0, counters };
}

export interface PlannedSession {
  focus: Focus;
  type: SessionType;
  /** 1-based position in this focus's cycle, e.g. 2 of 3. */
  cycleStep: number;
}

export function currentPlan(state: RotationState): PlannedSession {
  const focus = state.order[state.nextIndex % state.order.length];
  const c = state.counters[focus] % CYCLE.length;
  return { focus, type: CYCLE[c], cycleStep: c + 1 };
}

/** Upcoming sessions in order, without mutating state. */
export function preview(state: RotationState, count: number): PlannedSession[] {
  const out: PlannedSession[] = [];
  let s = state;
  for (let i = 0; i < count; i++) {
    out.push(currentPlan(s));
    s = completeSession(s);
  }
  return out;
}

/** A completed session advances that focus's counter and moves to the next focus. */
export function completeSession(state: RotationState): RotationState {
  const { focus } = currentPlan(state);
  return {
    ...state,
    nextIndex: (state.nextIndex + 1) % state.order.length,
    counters: { ...state.counters, [focus]: (state.counters[focus] + 1) % CYCLE.length },
  };
}

/**
 * A skip rolls the plan forward to the next focus with no gap. The skipped focus keeps
 * its counter, so it comes back with the same session type next time around.
 */
export function skipSession(state: RotationState): RotationState {
  return { ...state, nextIndex: (state.nextIndex + 1) % state.order.length };
}
