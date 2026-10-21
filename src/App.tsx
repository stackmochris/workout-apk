import { useEffect, useState } from 'react';
import { setNotificationsEnabled } from './lib/alerts';
import { useAppData } from './lib/store';
import Today from './screens/Today';
import History from './screens/History';
import SettingsScreen from './screens/Settings';
import UpdateBanner from './components/UpdateBanner';
import Summary, { weekCount } from './screens/Summary';

type Tab = 'today' | 'history' | 'summary' | 'settings';

export default function App() {
  const [data, setData] = useAppData();
  useEffect(() => setNotificationsEnabled(data.settings.notifications), [data.settings.notifications]);
  const [tab, setTab] = useState<Tab>('today');
  const done = weekCount(data.sessions);
  const unlocked = done >= data.settings.summaryThreshold;

  return (
    <div className="app">
      <UpdateBanner />
      <main>
        {tab === 'today' && <Today data={data} setData={setData} />}
        {tab === 'history' && <History data={data} />}
        {tab === 'summary' && <Summary data={data} />}
        {tab === 'settings' && <SettingsScreen data={data} setData={setData} />}
      </main>
      <nav className="tabs">
        {(['today', 'history', 'summary', 'settings'] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
            <span>{t === 'today' ? '●' : t === 'history' ? '☰' : t === 'summary' ? (unlocked ? '▲' : '🔒') : '⚙'}</span>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </nav>
    </div>
  );
}
