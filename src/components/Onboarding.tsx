import { useState } from 'react';
import { SplitType, UserPrefs } from '../types';
import { SPLIT_LABELS, TEMPLATES } from '../data/templates';

interface Props {
  onComplete: (prefs: UserPrefs) => void;
}

const SPLITS: SplitType[] = ['per-muscle', 'push-pull-legs', 'upper-lower', 'mixed'];

export default function Onboarding({ onComplete }: Props) {
  const [name, setName] = useState('');
  const [split, setSplit] = useState<SplitType>('per-muscle');

  const finish = () => {
    const prefs: UserPrefs = {
      split,
      templates: TEMPLATES[split],
      onboarded: true,
      name: name.trim() || undefined,
    };
    onComplete(prefs);
  };

  return (
    <div className="card" style={{ margin: 16 }}>
      <h2>Welcome</h2>
      <p className="muted">Choose how you train. You can change this later.</p>

      <label className="form">
        Your name (optional)
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
      </label>

      <div className="chips" style={{ margin: '16px 0', flexWrap: 'wrap' }}>
        {SPLITS.map((s) => (
          <button key={s} className={`chip ${split === s ? 'on' : ''}`} onClick={() => setSplit(s)}>
            {SPLIT_LABELS[s]}
          </button>
        ))}
      </div>

      <p className="muted small">
        {split === 'per-muscle' && 'Classic 5-day focus rotation (Chest, Shoulder, Back, Arm, Leg).'}
        {split === 'push-pull-legs' && 'Push, Pull, and Legs days. Mix movements freely.'}
        {split === 'upper-lower' && 'Upper and Lower body days.'}
        {split === 'mixed' && 'Flexible mixed-group sessions. Add anything you want.'}
      </p>

      <button className="primary wide" onClick={finish}>Get started</button>
    </div>
  );
}
