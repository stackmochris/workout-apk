import { useEffect, useState } from 'react';
import { isPartialKg, parseKg, parseReps } from '../lib/kg';

/** Text-backed number input so partial entries like "12." or "12,5" survive while typing. */
export default function NumInput({ value, onChange, kind, placeholder, label }: {
  value: number | null; onChange: (n: number | null) => void; kind: 'kg' | 'reps'; placeholder: string; label: string;
}) {
  const [text, setText] = useState(value == null ? '' : String(value));
  useEffect(() => {
    const parsed = kind === 'kg' ? parseKg(text) : parseReps(text);
    if (parsed !== value) setText(value == null ? '' : String(value));
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  const parsed = kind === 'kg' ? parseKg(text) : parseReps(text);
  const invalid = parsed === undefined && !(kind === 'kg' && isPartialKg(text));
  return (
    <input aria-label={label} inputMode={kind === 'kg' ? 'decimal' : 'numeric'} placeholder={placeholder} value={text}
      className={invalid ? 'invalid' : ''}
      onChange={(e) => {
        const t = e.target.value;
        setText(t);
        const n = kind === 'kg' ? parseKg(t) : parseReps(t);
        if (n !== undefined) onChange(n);
      }} />
  );
}
