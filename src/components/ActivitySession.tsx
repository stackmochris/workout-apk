import { useState } from 'react';
import { ActivityType, Session } from '../types';
import { uid } from '../lib/store';

interface Props {
  focus: string;
  onCancel: () => void;
  onFinish: (session: Partial<Session>) => void;
}

const ACTIVITIES: ActivityType[] = ['run', 'walk', 'hike', 'calisthenics', 'other'];

export default function ActivitySession({ focus, onCancel, onFinish }: Props) {
  const [activity, setActivity] = useState<ActivityType>('run');
  const [duration, setDuration] = useState('');
  const [distance, setDistance] = useState('');
  const [effort, setEffort] = useState(5);
  const [notes, setNotes] = useState('');

  const submit = () => {
    const dur = parseFloat(duration) || undefined;
    const dist = parseFloat(distance) || undefined;
    if (!dur && !dist && !notes) {
      alert('Add at least duration, distance or notes');
      return;
    }
    onFinish({
      activity,
      durationMin: dur,
      distanceKm: dist,
      effort,
      notes: notes || undefined,
      movements: [{ movementId: `activity-${activity}`, name: activity, sets: [] }],
      status: 'completed',
    });
  };

  return (
    <div className="card">
      <h3>Non-gym session — {focus}</h3>
      <div className="chips" style={{ margin: '12px 0' }}>
        {ACTIVITIES.map((a) => (
          <button key={a} className={`chip ${activity === a ? 'on' : ''}`} onClick={() => setActivity(a)}>
            {a}
          </button>
        ))}
      </div>
      <label className="form">
        Duration (min)
        <input type="number" value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="e.g. 45" />
      </label>
      <label className="form">
        Distance (km)
        <input type="number" step="0.1" value={distance} onChange={(e) => setDistance(e.target.value)} placeholder="optional" />
      </label>
      <label className="form">
        Effort (1–10)
        <input type="range" min={1} max={10} value={effort} onChange={(e) => setEffort(Number(e.target.value))} />
        <span>{effort}</span>
      </label>
      <label className="form">
        Notes
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="How it felt, route, etc." />
      </label>
      <div className="row">
        <button className="ghost" onClick={onCancel}>Cancel</button>
        <button className="primary" onClick={submit}>Log activity</button>
      </div>
    </div>
  );
}
