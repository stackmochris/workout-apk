import { FrequencyResult } from '../engine/frequency';

export default function FrequencyBanner({ result, onDismiss }: { result: FrequencyResult | null; onDismiss: () => void }) {
  if (!result?.message) return null;
  return (
    <div className="banner" role="status" style={{ margin: '8px 0' }}>
      <strong>{result.muscle} · {result.count}× this week</strong>
      <span>{result.message}</span>
      <button className="ghost" onClick={onDismiss} style={{ marginLeft: 'auto' }}>Dismiss</button>
    </div>
  );
}
