import { useEffect, useState } from 'react';
import { setNotificationsEnabled } from './lib/alerts';
import { useAppData } from './lib/store';
import Today from './screens/Today';
import History from './screens/History';
import SettingsScreen from './screens/Settings';
import UpdateBanner from './components/UpdateBanner';
import Progress from './screens/Progress';
import Summary, { weekCount } from './screens/Summary';
import Onboarding from './components/Onboarding';
import { UserPrefs } from './types';

type Tab = 'today' | 'history' | 'progress' | 'summary' | 'settings';

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
  const [data, setData] = useAppData();
  const [prefs, setPrefs] = useState<UserPrefs | null>(loadPrefs);
  useEffect(() => setNotificationsEnabled(data.settings.notifications), [data.settings.notifications]);
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
        {tab === 'settings' && <SettingsScreen data={data} setData={setData} />}
      </main>
      <nav className="tabs">
        {(['today', 'history', 'progress', 'summary', 'settings'] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
            <span>{t === 'today' ? '●' : t === 'history' ? '☰' : t === 'progress' ? '↗' : t === 'summary' ? (unlocked ? '▲' : '🔒') : '⚙'}</span>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </nav>
    </div>
  );
}
