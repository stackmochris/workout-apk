import { useRef, useState } from 'react';
import NumInput from './NumInput';
import { SET_KINDS, SetEntry, SetKind } from '../types';

const KIND_LABEL: Record<SetKind, string> = { working: '', warmup: 'W', drop: 'D', failure: 'F' };
const KIND_NAME: Record<SetKind, string> = { working: 'Working', warmup: 'Warm-up', drop: 'Drop set', failure: 'To failure' };

/**
 * One set row. Tap the set number to cycle the set type. Swipe right to complete the set with
 * the hinted numbers, swipe left on a done set to clear it. The tick button does the same.
 */
export default function SetRow({ index, s, hint, onEdit, onTick, onKind }: {
  index: number;
  s: SetEntry;
  hint: { weight: number | null; reps: number | null };
  onEdit: (patch: { reps?: number | null; weight?: number | null }) => void;
  onTick: () => void;
  onKind: (k: SetKind) => void;
}) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const [dx, setDx] = useState(0);
  const kind = s.kind ?? 'working';
  const nextKind = SET_KINDS[(SET_KINDS.indexOf(kind) + 1) % SET_KINDS.length];

  return (
    <div className="swipe-wrap">
      <div className={`swipe-under ${dx > 0 ? 'right' : dx < 0 ? 'left' : ''}`}>{dx > 0 ? '✓ Done' : dx < 0 ? 'Clear' : ''}</div>
      <div
        className={`set ${s.done ? 'done' : ''} kind-${kind}`}
        style={{ transform: dx ? `translateX(${dx}px)` : undefined }}
        onPointerDown={(e) => { if ((e.target as HTMLElement).tagName !== 'INPUT') start.current = { x: e.clientX, y: e.clientY }; }}
        onPointerMove={(e) => {
          if (!start.current) return;
          const x = e.clientX - start.current.x, y = e.clientY - start.current.y;
          if (Math.abs(y) > 30 && Math.abs(y) > Math.abs(x)) { start.current = null; setDx(0); return; }
          setDx(Math.max(-110, Math.min(110, x)));
        }}
        onPointerUp={() => {
          if (start.current && ((dx > 70 && !s.done) || (dx < -70 && s.done))) onTick();
          start.current = null;
          setDx(0);
        }}
        onPointerCancel={() => { start.current = null; setDx(0); }}
      >
        <button className={`setno ${kind}`} aria-label={`Set ${index + 1}, ${KIND_NAME[kind]}. Tap for ${KIND_NAME[nextKind]}`} onClick={() => onKind(nextKind)}>
          {KIND_LABEL[kind] || index + 1}
        </button>
        <NumInput kind="kg" label={`Set ${index + 1} kg`} placeholder={hint.weight != null ? String(hint.weight) : 'kg'} value={s.weight}
          onChange={(n) => onEdit({ weight: n })} />
        <NumInput kind="reps" label={`Set ${index + 1} reps`} placeholder={hint.reps != null ? String(hint.reps) : 'reps'} value={s.reps}
          onChange={(n) => onEdit({ reps: n })} />
        <button aria-label={s.done ? 'Done. Tap to clear' : 'Complete with suggested numbers'} className={`tick ${s.done ? 'on' : ''}`} onClick={onTick}>✓</button>
      </div>
    </div>
  );
}
