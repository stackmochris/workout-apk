import NumInput from './NumInput';
import { SET_KINDS, SetEntry, SetKind } from '../types';

const KIND_LABEL: Record<SetKind, string> = { working: '', warmup: 'W', drop: 'D', failure: 'F' };
const KIND_NAME: Record<SetKind, string> = { working: 'Working', warmup: 'Warm-up', drop: 'Drop set', failure: 'To failure' };

export default function SetRow({ rowId, index, s, hint, onEdit, onTick, onKind, label, current }: {
  rowId: string;
  index: number;
  s: SetEntry;
  hint: { weight: number | null; reps: number | null };
  onEdit: (patch: Partial<SetEntry>) => void;
  onTick: () => void;
  onKind: (k: SetKind) => void;
  label?: string;
  current: boolean;
}) {
  const kind = s.kind ?? 'working';
  const nextKind = SET_KINDS[(SET_KINDS.indexOf(kind) + 1) % SET_KINDS.length];
  const isDrop = kind === 'drop';
  const mark = label || String(index + 1);

  return (
    <div data-set-row={rowId} className={`set ${s.done ? 'done' : ''} ${current ? 'current-set' : ''} kind-${kind} ${isDrop ? 'drop-row' : ''}`}>
      <button className={`setno ${kind}${label ? ' mark' : ''}`} aria-label={`Set ${mark}, ${KIND_NAME[kind]}. Tap for ${KIND_NAME[nextKind]}`} onClick={() => onKind(nextKind)}>
        {KIND_LABEL[kind] || mark}
      </button>
      {isDrop ? (
        <>
          <NumInput kind="kg" label={`Set ${mark} start kg`} placeholder="start" value={s.dropStart ?? null}
            onChange={(n) => onEdit({ dropStart: n, weight: n })} />
          <NumInput kind="kg" label={`Set ${mark} end kg`} placeholder="end" value={s.dropEnd ?? null}
            onChange={(n) => onEdit({ dropEnd: n })} />
        </>
      ) : (
        <NumInput kind="kg" label={`Set ${mark} kg`} placeholder={hint.weight != null ? String(hint.weight) : 'kg'} value={s.weight}
          onChange={(n) => onEdit({ weight: n })} />
      )}
      <NumInput kind="reps" label={`Set ${mark} reps`} placeholder={hint.reps != null ? String(hint.reps) : 'reps'} value={s.reps}
        onChange={(n) => onEdit({ reps: n })} />
      <input aria-label={`Set ${mark} RIR`} inputMode="numeric" placeholder="RIR" value={s.rir ?? ''}
        onChange={(e) => {
          const text = e.target.value.trim();
          if (text === '') { onEdit({ rir: null }); return; }
          const n = Number(text);
          if (Number.isInteger(n) && n >= 0 && n <= 10) onEdit({ rir: n });
        }} />
      <button aria-label={s.done ? `Undo logged set ${mark}` : `Log set ${mark}`}
        className={`tick ${s.done ? 'on' : ''}`} disabled={!s.done && s.reps == null && hint.reps == null} onClick={onTick}>
        {s.done ? '✓' : 'Log'}
      </button>
    </div>
  );
}
