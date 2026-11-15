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

type Route = Tab | 'summary' | 'others';

function readRoute(): Route {
  const hash = window.location.hash.slice(1);
  switch (hash) {
    case 'history':
    case 'progress':
    case 'summary':
    case 'more':
    case 'others':
      return hash;
    default:
      return 'today';
  }
}

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
  const [route, setRoute] = useState(readRoute);
  const tab = route === 'summary' ? 'progress' : route === 'others' ? 'more' : route;
  const todayScroll = useRef(0);
  const navigate = (next: Route) => {
    if (next !== route) window.location.hash = next;
  };
  useEffect(() => {
    const onHashChange = () => {
      const next = readRoute();
      if (route === 'today' && next !== 'today') todayScroll.current = window.scrollY;
      setRoute(next);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [route]);
  useEffect(() => {
    window.scrollTo(0, route === 'today' ? todayScroll.current : 0);
  }, [route]);
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
            <button className="chip" aria-pressed={route === 'progress'} onClick={() => navigate('progress')}>Progress</button>
            <button className="chip" aria-pressed={route === 'summary'} onClick={() => navigate('summary')}>Weekly summary{!unlocked && ' 🔒'}</button>
          </div>
          {route === 'summary' ? <Summary data={data} /> : <Progress data={data} setData={setData} />}
        </>}
        {tab === 'more' && <>
          <div className="view-switch">
            <button className="chip" aria-pressed={route === 'more'} onClick={() => navigate('more')}>Settings</button>
            <button className="chip" aria-pressed={route === 'others'} onClick={() => navigate('others')}>Others</button>
          </div>
          {route === 'others' ? <Others /> : <SettingsScreen data={data} setData={setData} />}
        </>}
      </main>
      <nav className="tabs" aria-label="Main navigation">
        {(['today', 'history', 'progress', 'more'] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? 'on' : ''} aria-current={tab === t ? 'page' : undefined} onClick={() => navigate(t)}>
            <span aria-hidden="true">{t === 'today' ? '●' : t === 'history' ? '☰' : t === 'progress' ? '↗' : '⋯'}</span>
            {t === 'today' && active ? 'Resume workout' : t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </nav>
    </div>
  );
}
