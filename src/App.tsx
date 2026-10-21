import { useState } from 'react';
import { useAppData } from './lib/store';
import Today from './screens/Today';
import History from './screens/History';
import SettingsScreen from './screens/Settings';
import Summary, { weekCount } from './screens/Summary';

type Tab = 'today' | 'history' | 'summary' | 'settings';

export default function App() {
  const [data, setData] = useAppData();
  const [tab, setTab] = useState<Tab>('today');
  const done = weekCount(data.sessions);
  const unlocked = done >= data.settings.summaryThreshold;

  return (
    <div className="app">
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
