export interface PlateLoad {
  /** Closest loadable total at or below the target (bar + 2 × plates). */
  total: number;
  /** Plates for one side, heaviest first. */
  perSide: number[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Greedy plate breakdown. Rounds down to the nearest weight the plate set can make. */
export function plateLoad(target: number, bar = 20, plates: number[] = [25, 20, 15, 10, 5, 2.5, 1.25]): PlateLoad {
  if (!(target > bar)) return { total: bar, perSide: [] };
  const sorted = [...plates].filter((p) => p > 0).sort((a, b) => b - a);
  let side = r2((target - bar) / 2);
  const perSide: number[] = [];
  for (const p of sorted) {
    while (side + 1e-9 >= p) { perSide.push(p); side = r2(side - p); }
  }
  return { total: r2(bar + 2 * perSide.reduce((a, b) => a + b, 0)), perSide };
}

/** Nearest loadable barbell weight (rounds to the closer of the two neighbours, ties go up). */
export function roundLoadable(target: number, bar = 20, plates?: number[]): number {
  const down = plateLoad(target, bar, plates).total;
  const smallest = Math.min(...(plates ?? [1.25]));
  const up = plateLoad(target + 2 * smallest, bar, plates).total;
  return target - down < up - target ? down : up;
}

export const plateLabel = (p: PlateLoad) => (p.perSide.length ? `${p.perSide.join(' + ')} per side` : 'Empty bar');
