import { useRef, useState } from 'react';
import { SessionStats } from '../engine/sessionStats';

export default function FinishSheet({
  stats,
  focus,
  type,
  onCancel,
  onConfirm,
}: {
  stats: SessionStats;
  focus: string;
  type: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [include, setInclude] = useState({
    time: true,
    reps: true,
    volume: true,
    prs: true,
    failure: true,
    drops: true,
  });

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => setPhoto(String(r.result));
    r.readAsDataURL(f);
  };

  const share = async () => {
    const lines = [
      `${focus} ${type}`,
      include.time && stats.durationMin != null ? `${stats.durationMin} min` : null,
      include.reps ? `${stats.totalReps} reps` : null,
      include.volume && stats.totalVolume > 0 ? `${Math.round(stats.totalVolume)} kg volume` : null,
      include.prs && stats.prs.length ? `PRs: ${stats.prs.map((p) => p.movement).join(', ')}` : null,
      include.failure && stats.failureSets ? `${stats.failureSets} to failure` : null,
      include.drops && stats.dropSets ? `${stats.dropSets} drop sets` : null,
    ].filter(Boolean).join(' \u00b7 ');

    try {
      if (photo && navigator.share && navigator.canShare) {
        const blob = await (await fetch(photo)).blob();
        const file = new File([blob], 'workout.jpg', { type: blob.type || 'image/jpeg' });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ title: 'Workout', text: lines, files: [file] });
          onConfirm();
          return;
        }
      }
      if (navigator.share) {
        await navigator.share({ title: 'Workout', text: lines });
      } else {
        await navigator.clipboard.writeText(lines);
        alert('Stats copied');
      }
    } catch {
      /* user cancelled share */
    }
    onConfirm();
  };

  return (
    <div className="sheet" onClick={onCancel}>
      <div className="sheet-body" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '90vh', overflow: 'auto' }}>
        <h3>Finish {focus}</h3>
        <p className="muted small">{type} session</p>

        <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, margin: '12px 0' }}>
          <Stat label="Time" value={stats.durationMin != null ? `${stats.durationMin} min` : '\u2013'} on={include.time} toggle={() => setInclude((s) => ({ ...s, time: !s.time }))} />
          <Stat label="Reps" value={String(stats.totalReps)} on={include.reps} toggle={() => setInclude((s) => ({ ...s, reps: !s.reps }))} />
          <Stat label="Volume" value={stats.totalVolume ? `${Math.round(stats.totalVolume)} kg` : '\u2013'} on={include.volume} toggle={() => setInclude((s) => ({ ...s, volume: !s.volume }))} />
          <Stat label="Working" value={String(stats.workingSets)} />
          <Stat label="To failure" value={String(stats.failureSets)} on={include.failure} toggle={() => setInclude((s) => ({ ...s, failure: !s.failure }))} />
          <Stat label="Drop sets" value={String(stats.dropSets)} on={include.drops} toggle={() => setInclude((s) => ({ ...s, drops: !s.drops }))} />
        </div>

        {stats.prs.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <strong>PRs</strong>
            <ul className="muted small">
              {stats.prs.map((p) => (
                <li key={p.movement}>{p.movement}: <b className="tick-num">{p.weight}</b> kg × <b className="tick-num">{p.reps}</b></li>
              ))}
            </ul>
          </div>
        )}

        <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={onFile} />
        <button className="ghost wide" onClick={() => fileRef.current?.click()}>
          {photo ? 'Retake photo' : 'Take photo'}
        </button>

        {photo && (
          <div style={{ position: 'relative', marginTop: 12, borderRadius: 12, overflow: 'hidden' }}>
            <img src={photo} alt="Workout" style={{ width: '100%', display: 'block' }} />
            <div style={{
              position: 'absolute', left: 12, right: 12, bottom: 12,
              background: 'rgba(0,0,0,.65)', color: '#fff', borderRadius: 10, padding: '10px 12px',
              fontSize: 13, lineHeight: 1.4,
            }}>
              <strong>{focus} {type}</strong><br />
              {include.time && stats.durationMin != null && <>{stats.durationMin} min \u00b7 </>}
              {include.reps && <>{stats.totalReps} reps \u00b7 </>}
              {include.volume && stats.totalVolume > 0 && <>{Math.round(stats.totalVolume)} kg<br /></>}
              {include.prs && stats.prs.length > 0 && <>PRs: {stats.prs.map((p) => p.movement).join(', ')}<br /></>}
              {include.failure && stats.failureSets > 0 && <>{stats.failureSets} to failure \u00b7 </>}
              {include.drops && stats.dropSets > 0 && <>{stats.dropSets} drops</>}
            </div>
          </div>
        )}

        <div className="row" style={{ marginTop: 16 }}>
          <button className="ghost" onClick={onCancel}>Cancel</button>
          <button className="primary" onClick={share}>{photo ? 'Share & finish' : 'Finish'}</button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, on, toggle }: { label: string; value: string; on?: boolean; toggle?: () => void }) {
  return (
    <button type="button" className={`chip ${on === false ? '' : 'on'}`} onClick={toggle} style={{ textAlign: 'left', opacity: on === false ? 0.5 : 1 }}>
      <small style={{ display: 'block', opacity: 0.7 }}>{label}</small>
      <strong className="nums">{value}</strong>
    </button>
  );
}
