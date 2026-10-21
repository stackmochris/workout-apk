/** Minimal SVG line chart. Optional second series draws as a smoothed trend line. */
export default function LineChart({ points, trend, unit = '', height = 140 }: {
  points: { x: number; y: number }[];
  trend?: number[];
  unit?: string;
  height?: number;
}) {
  if (points.length < 2) return <p className="muted">{points.length ? `${points[0].y} ${unit} · log one more to see a trend` : 'Nothing logged yet'}</p>;
  const W = 320, H = height, P = 26;
  const ys = [...points.map((p) => p.y), ...(trend ?? [])];
  let lo = Math.min(...ys), hi = Math.max(...ys);
  if (hi === lo) { hi += 1; lo -= 1; }
  const pad = (hi - lo) * 0.1; lo -= pad; hi += pad;
  const x0 = points[0].x, x1 = points[points.length - 1].x || x0 + 1;
  const sx = (x: number) => P + ((x - x0) / (x1 - x0 || 1)) * (W - P - 8);
  const sy = (y: number) => 8 + (1 - (y - lo) / (hi - lo)) * (H - 24);
  const path = (vals: number[]) => vals.map((y, i) => `${i ? 'L' : 'M'}${sx(points[i].x).toFixed(1)},${sy(y).toFixed(1)}`).join(' ');
  const last = points[points.length - 1];
  const fmt = (n: number) => (Math.round(n * 10) / 10).toString();
  const d = (t: number) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Latest ${fmt(last.y)} ${unit}`}>
      <line x1={P} x2={W - 8} y1={sy(hi - pad)} y2={sy(hi - pad)} className="grid" />
      <line x1={P} x2={W - 8} y1={sy(lo + pad)} y2={sy(lo + pad)} className="grid" />
      <text x={2} y={sy(hi - pad) + 4} className="axis">{fmt(hi - pad)}</text>
      <text x={2} y={sy(lo + pad) + 4} className="axis">{fmt(lo + pad)}</text>
      <path d={path(points.map((p) => p.y))} className={trend ? 'raw' : 'line'} />
      {trend && <path d={path(trend)} className="line" />}
      {points.map((p, i) => <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r={trend ? 2 : 3} className="dot" />)}
      <text x={P} y={H - 2} className="axis">{d(x0)}</text>
      <text x={W - 8} y={H - 2} className="axis end">{d(x1)}</text>
    </svg>
  );
}
