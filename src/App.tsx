import { useEffect, useState } from 'react';
import { setNotificationsEnabled } from './lib/alerts';
import { AuthProvider, useAuth } from './lib/auth';
import { catchUp } from './lib/cloudSync';
import { useAppData } from './lib/store';
import { syncDisplayName } from './lib/sync';
import Today from './screens/Today';
import History from './screens/History';
import SettingsScreen from './screens/Settings';
import UpdateBanner from './components/UpdateBanner';
import Progress from './screens/Progress';
import Summary, { weekCount } from './screens/Summary';
import Others from './screens/Others';
import Onboarding from './components/Onboarding';
import { UserPrefs } from './types';

type Tab = 'today' | 'history' | 'progress' | 'summary' | 'others' | 'settings';

const PREFS_KEY = 'workout-apk:prefs';

function loadPrefs(): UserPrefs | null {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export default function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}

function Shell() {
  const [data, setData] = useAppData();
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<UserPrefs | null>(loadPrefs);
  useEffect(() => setNotificationsEnabled(data.settings.notifications), [data.settings.notifications]);
  useEffect(() => {
    if (!user) return;
    catchUp(user.uid, data.sessions, data.body, syncDisplayName(data.settings.displayName, user.displayName, user.email));
    // Once per sign-in. Later workouts and body logs sync themselves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);
  const [tab, setTab] = useState<Tab>('today');
  const done = weekCount(data.sessions);
  const unlocked = done >= data.settings.summaryThreshold;

  const completeOnboarding = (p: UserPrefs) => {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
    setPrefs(p);
  };

  const themeClass = `theme-${data.settings.theme || 'green'}`;

  if (!prefs?.onboarded) {
    return (
      <div className={`app ${themeClass}`}>
        <Onboarding onComplete={completeOnboarding} />
      </div>
    );
  }

  return (
    <div className={`app ${themeClass}`}>
      <UpdateBanner />
      <main>
        {tab === 'today' && <Today data={data} setData={setData} prefs={prefs} />}
        {tab === 'history' && <History data={data} />}
        {tab === 'progress' && <Progress data={data} setData={setData} />}
        {tab === 'summary' && <Summary data={data} />}
        {tab === 'others' && <Others />}
        {tab === 'settings' && <SettingsScreen data={data} setData={setData} />}
      </main>
      <nav className="tabs">
        {(['today', 'history', 'progress', 'summary', 'others', 'settings'] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
            <span>{t === 'today' ? '●' : t === 'history' ? '☰' : t === 'progress' ? '↗' : t === 'summary' ? (unlocked ? '▲' : '🔒') : t === 'others' ? '◎' : '⚙'}</span>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </nav>
    </div>
  );
}
