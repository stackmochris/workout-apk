import { AppData } from '../lib/store';
import { weekCount } from '../engine/week';

export { weekCount, weekStart } from '../engine/week';


export default function Summary({ data }: { data: AppData }) {
  const n = weekCount(data.sessions);
  const need = data.settings.summaryThreshold;
  return (
    <section>
      <header className="hero"><small>This week</small><h1>Summary</h1></header>
      <div className={`card ${n >= need ? 'complete' : 'locked'}`}>
        <h3>{n >= need ? 'Unlocked' : '🔒 Locked'}</h3>
        <p>{n} of {need} workouts completed this week.</p>
        <div className="progress"><i style={{ width: `${Math.min(100, (n / need) * 100)}%` }} /></div>
        <p className="muted">Trends, PRs, bodyweight weekly average and the final weigh-in arrive in M3.</p>
      </div>
    </section>
  );
}
