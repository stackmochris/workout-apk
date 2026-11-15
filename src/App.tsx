import { useEffect, useRef, useState } from 'react';
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

type Tab = 'today' | 'history' | 'progress' | 'more';

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
  const todayScroll = useRef(0);
  const navigate = (next: Tab) => {
    if (next === tab) return;
    if (tab === 'today') todayScroll.current = window.scrollY;
    setTab(next);
  };
  useEffect(() => {
    window.scrollTo(0, tab === 'today' ? todayScroll.current : 0);
  }, [tab]);
  const [progressView, setProgressView] = useState<'progress' | 'summary'>('progress');
  const [moreView, setMoreView] = useState<'settings' | 'others'>('settings');
  const active = !!data.draft?.startedAt;
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
        <div hidden={tab !== 'today'}>
          <Today data={data} setData={setData} prefs={prefs} onHistory={() => navigate('history')} />
        </div>
        {tab === 'history' && <History data={data} />}
        {tab === 'progress' && <>
          <div className="view-switch">
            <button className="chip" aria-pressed={progressView === 'progress'} onClick={() => setProgressView('progress')}>Progress</button>
            <button className="chip" aria-pressed={progressView === 'summary'} onClick={() => setProgressView('summary')}>Weekly summary{!unlocked && ' 🔒'}</button>
          </div>
          {progressView === 'summary' ? <Summary data={data} /> : <Progress data={data} setData={setData} />}
        </>}
        {tab === 'more' && <>
          <div className="view-switch">
            <button className="chip" aria-pressed={moreView === 'settings'} onClick={() => setMoreView('settings')}>Settings</button>
            <button className="chip" aria-pressed={moreView === 'others'} onClick={() => setMoreView('others')}>Others</button>
          </div>
          {moreView === 'others' ? <Others /> : <SettingsScreen data={data} setData={setData} />}
        </>}
      </main>
      {(!active || tab !== 'today') && <nav className="tabs" aria-label="Main navigation">
        {(['today', 'history', 'progress', 'more'] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? 'on' : ''} aria-current={tab === t ? 'page' : undefined} onClick={() => navigate(t)}>
            <span aria-hidden="true">{t === 'today' ? '●' : t === 'history' ? '☰' : t === 'progress' ? '↗' : '⋯'}</span>
            {t === 'today' && active ? 'Resume workout' : t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </nav>}
    </div>
  );
}
