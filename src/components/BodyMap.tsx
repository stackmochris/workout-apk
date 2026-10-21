import { Muscle } from '../data/muscles';

type Shape = [Muscle, string];

// Simple front and back outlines on a 100×200 grid. Each muscle is a few soft shapes.
const ell = (cx: number, cy: number, rx: number, ry: number) => `M${cx - rx},${cy} a${rx},${ry} 0 1,0 ${2 * rx},0 a${rx},${ry} 0 1,0 ${-2 * rx},0`;
const FRONT: Shape[] = [
  ['chest', ell(40, 52, 9, 7) + ell(60, 52, 9, 7)],
  ['frontDelts', ell(29, 44, 5, 5) + ell(71, 44, 5, 5)],
  ['sideDelts', ell(25, 47, 3, 6) + ell(75, 47, 3, 6)],
  ['biceps', ell(24, 66, 4, 9) + ell(76, 66, 4, 9)],
  ['abs', 'M42,62 h16 v30 q-8,5 -16,0 z'],
  ['quads', ell(41, 120, 7, 20) + ell(59, 120, 7, 20)],
  ['calves', ell(40, 166, 4, 12) + ell(60, 166, 4, 12)],
];
const BACK: Shape[] = [
  ['traps', 'M40,36 q10,-6 20,0 l4,12 q-14,6 -28,0 z'],
  ['rearDelts', ell(28, 46, 5, 5) + ell(72, 46, 5, 5)],
  ['upperBack', ell(50, 56, 12, 7)],
  ['lats', 'M36,58 q-4,18 8,30 h12 q12,-12 8,-30 q-14,8 -28,0 z'],
  ['triceps', ell(24, 66, 4, 9) + ell(76, 66, 4, 9)],
  ['glutes', ell(42, 104, 8, 8) + ell(58, 104, 8, 8)],
  ['hamstrings', ell(41, 128, 6, 16) + ell(59, 128, 6, 16)],
  ['calves', ell(40, 164, 5, 12) + ell(60, 164, 5, 12)],
];
const OUTLINE = 'M50,6 a9,10 0 1,1 -0.1,0 M38,32 q12,-6 24,0 q14,2 16,14 l4,42 q1,8 -4,8 l-4,-32 l-2,36 l2,40 l-2,50 h-8 l-4,-44 h-4 l-4,44 h-8 l-2,-50 l2,-40 l-2,-36 l-4,32 q-5,0 -4,-8 l4,-42 q2,-12 16,-14 z';

/** Tint 0–1 → fill colour from neutral to the accent. */
const tint = (v: number) => `color-mix(in srgb, #2f9e5d ${Math.round(Math.min(1, v) * 100)}%, #e8e8e8)`;

function Figure({ shapes, load, label }: { shapes: Shape[]; load: Partial<Record<Muscle, number>>; label: string }) {
  return (
    <figure>
      <svg viewBox="0 0 100 200" className="body">
        <path d={OUTLINE} className="outline" />
        {shapes.map(([m, d], i) => <path key={i} d={d} style={{ fill: tint(load[m] ?? 0) }}><title>{m}</title></path>)}
      </svg>
      <figcaption>{label}</figcaption>
    </figure>
  );
}

export default function BodyMap({ load }: { load: Partial<Record<Muscle, number>> }) {
  return (
    <div className="bodymap">
      <Figure shapes={FRONT} load={load} label="Front" />
      <Figure shapes={BACK} load={load} label="Back" />
    </div>
  );
}
