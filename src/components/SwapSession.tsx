import { useState } from 'react';

type Option = { name: string; alt?: string };
type Props = {
  focus: string;
  option: Option | undefined;
  goal?: number;
  onCancel: () => void;
  onFinish: (name: string, reps: number[]) => void;
};

/** 100-rep bodyweight swap with a simple rep counter that can be split across sets. */
export default function SwapSession({ focus, option, goal = 100, onCancel, onFinish }: Props) {
  const [useAlt, setUseAlt] = useState(false);
  const [sets, setSets] = useState<number[]>([]);
  const [current, setCurrent] = useState(0);
  const name = (useAlt && option?.alt) || option?.name || `100 bodyweight reps (${focus})`;
  const total = sets.reduce((a, b) => a + b, 0) + current;
  const endSet = () => {
    if (current > 0) setSets((s) => [...s, current]);
    setCurrent(0);
  };
  const all = current > 0 ? [...sets, current] : sets;

  return (
    <div className="card swap-card">
      <h3>Bodyweight swap</h3>
      <p className="muted">Replaces today's {focus} session. Counts toward the week, kept out of strength trends and PRs.</p>
      {option?.alt && (
        <div className="row">
          <button className={`chip ${!useAlt ? 'on' : ''}`} onClick={() => setUseAlt(false)}>{option.name}</button>
          <button className={`chip ${useAlt ? 'on' : ''}`} onClick={() => setUseAlt(true)}>{option.alt}</button>
        </div>
      )}
      {option?.alt && !useAlt && <p className="flag">⚠ Elbow flagged: {option.alt} is the alternative.</p>}
      <h2 className="swap-name">{name}</h2>
      <div className="swap-total"><b>{total}</b> / {goal}</div>
      <div className="progress"><i style={{ width: `${Math.min(100, (total / goal) * 100)}%` }} /></div>
      <p className="muted">This set: {current}</p>
      <div className="row center">
        <button className="ghost" onClick={() => setCurrent((c) => Math.max(0, c - 1))}>−1</button>
        <button className="primary" onClick={() => setCurrent((c) => c + 1)}>+1</button>
        <button className="ghost" onClick={() => setCurrent((c) => c + 5)}>+5</button>
        <button className="ghost" onClick={() => setCurrent((c) => c + 10)}>+10</button>
      </div>
      <div className="row center">
        <button className="ghost" disabled={current === 0} onClick={endSet}>End set</button>
      </div>
      {sets.length > 0 && <p className="muted">Sets: {sets.join(' + ')}</p>}
      <button className="primary wide" disabled={total === 0} onClick={() => onFinish(name, all)}>
        {total >= goal ? 'Log swap' : `Log swap (${total} reps)`}
      </button>
      <button className="ghost wide" onClick={onCancel}>Back to the gym session</button>
    </div>
  );
}
