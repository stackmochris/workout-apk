import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../lib/auth';
import { db } from '../lib/firebase';
import { parseLastSession, type LastSessionView } from '../lib/sync';

function when(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function Others() {
  const { user, ready } = useAuth();
  const uid = user?.uid;
  const [rows, setRows] = useState<LastSessionView[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!uid || !db) {
      setRows([]);
      setError('');
      return;
    }
    setRows(null);
    return onSnapshot(collection(db, 'lastSessions'), (snap) => {
      const parsed = snap.docs
        .map((item) => parseLastSession(item.id, item.data()))
        .filter((item): item is LastSessionView => !!item)
        .sort((a, b) => b.date.localeCompare(a.date));
      setRows(parsed);
      setError('');
    }, () => setError('Could not load last sessions. Check that you are online and signed in.'));
  }, [uid]);

  return (
    <section>
      <header className="hero"><small>Group</small><h1>Others last</h1></header>
      {!ready && <div className="card"><p className="muted">Checking sign-in…</p></div>}
      {ready && !user && (
        <div className="empty">
          <h3>Sign in to see the group</h3>
          <p>Workouts still save on this device. Sign in from Settings to sync yours and see everyone else's last session.</p>
        </div>
      )}
      {ready && user && error && <div className="card"><p className="muted">{error}</p></div>}
      {ready && user && !error && rows === null && <div className="card"><p className="muted">Loading last sessions…</p></div>}
      {ready && user && !error && rows && rows.length === 0 && (
        <div className="empty">
          <h3>No synced workouts yet</h3>
          <p>Finish a session while signed in and it will show up here.</p>
        </div>
      )}
      {ready && user && !error && rows?.map((row) => {
        const mine = row.uid === user.uid;
        return (
          <article key={row.uid} className="card">
            <div className="mv-head">
              <h3 className="name-row">{row.displayName}{mine && <span className="you-tag">You</span>}</h3>
              <small>{when(row.date)}</small>
            </div>
            <p className="muted">{[row.focus, row.type, row.durationMin != null ? `${row.durationMin} min` : ''].filter(Boolean).join(' · ')}</p>
            {row.movements.map((movement, index) => (
              <p key={`${row.uid}:${index}`} className="hist-line">
                <span>{movement.name}</span>
                <span className="muted">{movement.sets} set{movement.sets === 1 ? '' : 's'}</span>
              </p>
            ))}
            {row.notes && <p className="muted small">{row.notes}</p>}
          </article>
        );
      })}
    </section>
  );
}
