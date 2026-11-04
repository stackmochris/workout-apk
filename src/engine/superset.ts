import { LoggedMovement } from '../types';

export interface SupersetEdit {
  movements: LoggedMovement[];
  /** Index of the movement the picker was opened from, after the edit. */
  anchorIndex: number;
}

export function supersetLetter(memberIndex: number): string {
  if (memberIndex >= 0 && memberIndex < 26) return String.fromCharCode(65 + memberIndex);
  return String(memberIndex + 1);
}

/** A1, B1, A2, B2 — member letter plus the 1-based set number. */
export function setMark(memberIndex: number, setIndex: number): string {
  return `${supersetLetter(memberIndex)}${setIndex + 1}`;
}

export function memberIndexes(movements: LoggedMovement[], index: number): number[] {
  if (index < 0 || index >= movements.length) return [];
  const group = movements[index].superset;
  if (!group) return [index];
  const members = movements.flatMap((m, i) => (m.superset === group ? [i] : []));
  return members.length ? members : [index];
}

function cloneMovement(m: LoggedMovement): LoggedMovement {
  const sets = Array.isArray(m.sets) ? m.sets.map((s) => ({ ...s })) : [];
  return { ...m, sets };
}

function withoutSuperset(m: LoggedMovement): LoggedMovement {
  if (!m.superset) return m;
  const copy = cloneMovement(m);
  delete copy.superset;
  return copy;
}

/**
 * Pull every movement that shares `index`'s superset into one contiguous block,
 * keeping relative order, placed where the first of them sat.
 */
export function compactGroup(movements: LoggedMovement[], index: number): SupersetEdit {
  const members = memberIndexes(movements, index);
  if (members.length <= 1) return { movements, anchorIndex: index };
  const ids = new Set(members);
  const block = members.map((i) => movements[i]);
  const rest: LoggedMovement[] = [];
  let insertAt = 0;
  let placed = false;
  movements.forEach((m, i) => {
    if (ids.has(i)) {
      if (!placed) {
        insertAt = rest.length;
        placed = true;
      }
      return;
    }
    rest.push(m);
  });
  const next = [...rest.slice(0, insertAt), ...block, ...rest.slice(insertAt)];
  const anchorIndex = next.indexOf(movements[index]);
  return { movements: next, anchorIndex: anchorIndex < 0 ? insertAt : anchorIndex };
}

/**
 * Fold `partnerIndex` into the anchor's superset. Logged sets, notes and timing
 * stay on the partner. Its old standalone card is removed. The anchor stays the
 * head of the card even if the partner was listed above it.
 */
export function mergeMovement(
  movements: LoggedMovement[],
  anchorIndex: number,
  partnerIndex: number,
  newGroupId: string,
): SupersetEdit {
  if (
    anchorIndex === partnerIndex ||
    anchorIndex < 0 || partnerIndex < 0 ||
    anchorIndex >= movements.length || partnerIndex >= movements.length
  ) {
    return { movements, anchorIndex };
  }
  const anchor = movements[anchorIndex];
  const partner = movements[partnerIndex];
  if (anchor.superset && anchor.superset === partner.superset) return compactGroup(movements, anchorIndex);

  const groupId = anchor.superset || newGroupId;
  const partnerGroup = partner.superset && partner.superset !== groupId ? partner.superset : undefined;

  let next = movements.map(cloneMovement);
  if (partnerGroup) {
    const survivors = next.filter((m, i) => i !== partnerIndex && m.superset === partnerGroup).length;
    if (survivors <= 1) {
      next = next.map((m, i) => (i !== partnerIndex && m.superset === partnerGroup ? withoutSuperset(m) : m));
    }
  }

  const joined = cloneMovement(next[partnerIndex]);
  joined.superset = groupId;
  const anchorShifted = anchorIndex > partnerIndex ? anchorIndex - 1 : anchorIndex;
  const without = next.filter((_, i) => i !== partnerIndex);
  const anchorGroup = anchor.superset;
  const memberAt: number[] = [];
  without.forEach((m, i) => {
    if (i === anchorShifted || (anchorGroup && m.superset === anchorGroup)) memberAt.push(i);
  });

  const block = memberAt.map((i) => {
    const copy = cloneMovement(without[i]);
    copy.superset = groupId;
    return copy;
  });
  const anchorPos = memberAt.indexOf(anchorShifted);
  if (anchorPos > 0) {
    const [head] = block.splice(anchorPos, 1);
    block.unshift(head);
  }
  block.push(joined);

  const rest = without.filter((_, i) => !memberAt.includes(i));
  let insertAt = 0;
  const firstMember = memberAt[0] ?? 0;
  for (let i = 0; i < firstMember; i++) if (!memberAt.includes(i)) insertAt++;

  return { movements: [...rest.slice(0, insertAt), ...block, ...rest.slice(insertAt)], anchorIndex: insertAt };
}

/**
 * Add a library movement to the anchor's superset. If that movement is already
 * its own card in the workout, merge the card (sets included) instead of
 * appending a blank duplicate.
 */
export function addLibraryMovement(
  movements: LoggedMovement[],
  anchorIndex: number,
  incoming: LoggedMovement,
  newGroupId: string,
): SupersetEdit {
  if (anchorIndex < 0 || anchorIndex >= movements.length) return { movements, anchorIndex };
  const anchor = movements[anchorIndex];
  const existing = movements.findIndex((m, i) => {
    if (i === anchorIndex || m.movementId !== incoming.movementId) return false;
    if (anchor.superset && m.superset === anchor.superset) return false;
    return true;
  });
  if (existing >= 0) return mergeMovement(movements, anchorIndex, existing, newGroupId);

  const groupId = anchor.superset || newGroupId;
  const tagged = movements.map((m, i) => {
    if (i === anchorIndex || (anchor.superset && m.superset === anchor.superset)) {
      const copy = cloneMovement(m);
      copy.superset = groupId;
      return copy;
    }
    return m;
  });
  let last = anchorIndex;
  tagged.forEach((m, i) => {
    if (m.superset === groupId) last = i;
  });
  const added = cloneMovement(incoming);
  added.superset = groupId;
  const next = [...tagged.slice(0, last + 1), added, ...tagged.slice(last + 1)];
  return compactGroup(next, anchorIndex);
}

/** Detach one movement. Sets stay with it. A group of one left behind is cleared. */
export function unlinkMovement(movements: LoggedMovement[], index: number): LoggedMovement[] {
  const group = movements[index]?.superset;
  if (!group) return movements;
  const cleared = movements.map((m, i) => (i === index ? withoutSuperset(m) : m));
  const left = cleared.filter((m) => m.superset === group).length;
  if (left <= 1) return cleared.map((m) => (m.superset === group ? withoutSuperset(m) : m));
  return cleared;
}

export function unlinkAll(movements: LoggedMovement[], index: number): LoggedMovement[] {
  const group = movements[index]?.superset;
  if (!group) return movements;
  return movements.map((m) => (m.superset === group ? withoutSuperset(m) : m));
}

/** Drop one movement from the workout. A group of one left behind is cleared. */
export function removeMovement(movements: LoggedMovement[], index: number): LoggedMovement[] {
  if (index < 0 || index >= movements.length) return movements;
  const group = movements[index].superset;
  const next = movements.filter((_, i) => i !== index);
  if (!group) return next;
  const left = next.filter((m) => m.superset === group).length;
  if (left <= 1) return next.map((m) => (m.superset === group ? withoutSuperset(m) : m));
  return next;
}

export function removeGroup(movements: LoggedMovement[], index: number): LoggedMovement[] {
  const ids = new Set(memberIndexes(movements, index));
  if (!ids.size) return movements;
  return movements.filter((_, i) => !ids.has(i));
}

/** Move a whole superset card up or down, swapping with the neighbouring card. */
export function moveBlock(movements: LoggedMovement[], index: number, dir: -1 | 1): LoggedMovement[] {
  const compacted = compactGroup(movements, index);
  const list = compacted.movements;
  const at = compacted.anchorIndex;
  const members = memberIndexes(list, at);
  const start = members[0];
  const end = members[members.length - 1];
  if (dir < 0) {
    if (start === 0) return list;
    const prev = memberIndexes(list, start - 1);
    const prevStart = prev[0];
    return [
      ...list.slice(0, prevStart),
      ...list.slice(start, end + 1),
      ...list.slice(prevStart, start),
      ...list.slice(end + 1),
    ];
  }
  if (end >= list.length - 1) return list;
  const nextMembers = memberIndexes(list, end + 1);
  const nextEnd = nextMembers[nextMembers.length - 1];
  return [
    ...list.slice(0, start),
    ...list.slice(end + 1, nextEnd + 1),
    ...list.slice(start, end + 1),
    ...list.slice(nextEnd + 1),
  ];
}

function groupStamp(group: LoggedMovement[]): number {
  let best = Infinity;
  for (const m of group) {
    if (!m.performedAt) continue;
    const t = new Date(m.performedAt).getTime();
    if (!Number.isNaN(t) && t < best) best = t;
  }
  return best;
}

/** Keep superset partners together, ordered by the first set anyone in the group logged. */
export function orderForSave(list: LoggedMovement[]): LoggedMovement[] {
  const groups: LoggedMovement[][] = [];
  const seen = new Set<string>();
  list.forEach((m) => {
    if (m.superset) {
      if (seen.has(m.superset)) return;
      seen.add(m.superset);
      groups.push(list.filter((x) => x.superset === m.superset));
    } else groups.push([m]);
  });
  const ordered = groups
    .map((g, i) => ({ g, i, t: groupStamp(g) }))
    .sort((a, b) => a.t - b.t || a.i - b.i)
    .flatMap((x) => x.g);
  const counts = new Map<string, number>();
  for (const m of ordered) if (m.superset) counts.set(m.superset, (counts.get(m.superset) ?? 0) + 1);
  return ordered.map((m) => (m.superset && (counts.get(m.superset) ?? 0) < 2 ? withoutSuperset(m) : m));
}

/** What finish() writes: each movement that has work, partners kept side by side. */
export function movementsToRecord(movements: LoggedMovement[], opts?: { keepAll?: boolean }): LoggedMovement[] {
  const kept = opts?.keepAll
    ? movements
    : movements.filter((m) => m.finished || m.durationMin != null || m.distanceKm != null || m.sets.some((s) => s.done));
  return orderForSave(kept);
}

/**
 * Saved supersets are a shared id on each movement. Drop ids that no longer
 * pair anyone, and pull a split group back into one block. Field shape is unchanged.
 */
export function normalizeSupersetGroups(movements: LoggedMovement[] | undefined | null): LoggedMovement[] {
  if (!Array.isArray(movements)) return [];
  const counts = new Map<string, number>();
  for (const m of movements) {
    if (m && typeof m.superset === 'string' && m.superset) counts.set(m.superset, (counts.get(m.superset) ?? 0) + 1);
  }
  const cleaned = movements.filter((m) => m && typeof m === 'object').map((m) => {
    if (!m.superset || (counts.get(m.superset) ?? 0) < 2) return withoutSuperset(m);
    return m;
  });
  const seen = new Set<string>();
  const out: LoggedMovement[] = [];
  for (const m of cleaned) {
    if (!m.superset) {
      out.push(m);
      continue;
    }
    if (seen.has(m.superset)) continue;
    seen.add(m.superset);
    for (const x of cleaned) if (x.superset === m.superset) out.push(x);
  }
  return out;
}
