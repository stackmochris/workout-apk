import { MUSCLES, Muscle } from '../data/muscles';

type Region = readonly [Muscle, string];
type Load = Partial<Record<Muscle, number>>;

// Original simplified contours. Reference: OpenStax Anatomy & Physiology,
// Figure 11.5 (Overview of the Muscular System). Each path is the left half
// of a bilateral region, mirrored around the same centreline in both views.
const FRONT: Region[] = [
  ['sideDelts', 'M33 46 Q23 47 21 57 L20 63 Q24 62 27 57 Z'],
  ['frontDelts', 'M34 46 Q29 48 24 59 L28 64 Q33 60 36 49 Z'],
  ['chest', 'M37 49 Q43 50 49 48 L49 67 Q38 70 30 62 Q35 57 37 49 Z'],
  ['biceps', 'M27 65 Q30 69 28 78 L24 89 Q21 88 20 85 L21 75 Q23 68 27 65 Z'],
  ['abs', 'M49 70 Q45 70 41 69 Q40 79 42 90 L46 100 L49 102 Z'],
  ['quads', 'M36 105 Q40 111 47 117 Q46 137 40 152 Q35 153 33 144 Q30 130 33 115 Z'],
  ['calves', 'M33 159 Q30 163 31 174 L35 185 L35 168 Z'],
];
const BACK: Region[] = [
  ['traps', 'M49 39 Q44 39 43 35 Q41 43 34 46 Q42 50 46 57 L49 70 Z'],
  ['sideDelts', 'M33 46 Q23 47 21 57 L20 63 Q24 62 27 57 Z'],
  ['rearDelts', 'M34 47 Q30 50 25 60 L29 64 Q34 61 38 51 Z'],
  ['upperBack', 'M39 51 Q45 55 47 65 L46 71 Q40 69 32 64 Z'],
  ['lats', 'M31 66 Q38 69 46 74 Q44 87 48 99 Q41 97 37 87 Q35 75 31 66 Z'],
  ['triceps', 'M27 65 Q32 70 27 82 L24 90 Q20 89 19 85 L21 72 Z'],
  ['glutes', 'M48 102 Q41 101 36 97 Q32 103 33 112 Q35 119 42 118 Q48 117 49 111 Z'],
  ['hamstrings', 'M33 115 Q38 122 47 119 Q45 137 40 151 Q36 154 33 147 Q30 131 33 115 Z'],
  ['calves', 'M38 157 Q33 155 31 165 Q30 176 35 185 L37 189 Q41 182 43 170 Q44 161 41 158 Z'],
];

const HALF = 'M50 8 C42 8 38 13 38 21 Q37 25 40 29 Q41 33 44 35 L43 40 Q40 43 32 45 Q23 46 20 55 Q17 62 17 71 L15 84 Q12 91 11 101 L8 114 Q5 118 6 125 Q7 131 10 131 L12 125 Q15 126 16 121 L16 114 Q22 103 24 94 L29 77 Q32 69 32 72 Q35 83 35 91 Q35 98 32 106 Q28 119 30 136 L32 151 Q30 160 30 171 L34 192 Q34 199 30 202 Q26 207 32 209 L40 209 Q44 208 42 202 L41 193 Q44 180 45 166 L44 155 Q49 132 48 119 L50 115 Z';

const BANDS = ['None', 'Low', 'Moderate', 'High'] as const;
function band(load: number) {
  return load <= 0 ? 0 : load < 1 / 3 ? 1 : load < 2 / 3 ? 2 : 3;
}

function Figure({ regions, load, label }: { regions: Region[]; load: Load; label: string }) {
  return (
    <figure>
      <svg viewBox="2 4 96 210" className="body" role="img" aria-label={`${label} view of recent training load`}>
        <path d={HALF} className="body-outline" stroke="none" />
        <path d={HALF} className="body-outline" stroke="none" transform="translate(100 0) scale(-1 1)" />
        {regions.map(([muscle, path]) => (
          <g key={muscle} data-load={band(load[muscle] ?? 0)} className="body-region">
            <path d={path} />
            <path d={path} transform="translate(100 0) scale(-1 1)" />
          </g>
        ))}
      </svg>
      <figcaption>{label}</figcaption>
    </figure>
  );
}

export default function BodyMap({ load }: { load: Load }) {
  const leading = MUSCLES.map(({ id, label }) => ({ id, label, load: load[id] ?? 0 }))
    .filter((muscle) => muscle.load > 0)
    .sort((a, b) => b.load - a.load)
    .slice(0, 3);

  return (
    <>
      <div className="bodymap">
        <Figure regions={FRONT} load={load} label="Front" />
        <Figure regions={BACK} load={load} label="Back" />
      </div>
      <ul className="bodymap-legend" aria-label="Recent training load scale">
        {BANDS.map((label, index) => <li key={label}><i data-load={index} aria-hidden="true" />{label}</li>)}
      </ul>
      {leading.length ? (
        <ul className="bodymap-leaders" aria-label="Most-loaded muscles">
          {leading.map((muscle) => <li key={muscle.id}><b>{muscle.label}</b><span>{BANDS[band(muscle.load)]}</span></li>)}
        </ul>
      ) : <p className="muted small">No recent hard sets to show.</p>}
    </>
  );
}
