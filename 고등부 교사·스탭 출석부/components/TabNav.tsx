'use client';

import { useApp } from '@/store/AppContext';
import type { TabKey } from '@/types';

const TABS: { key: TabKey; icon: string; label: string; adminOnly?: boolean }[] = [
  { key: 'att',   icon: '📅', label: '출석' },
  { key: 'stat',  icon: '📊', label: '통계' },
  { key: 'admin', icon: '⚙️', label: '설정', adminOnly: true },
];

export default function TabNav() {
  const { state, dispatch } = useApp();
  const isAdmin = !state.userRole || state.userRole.role === 'admin';

  return (
    <nav className="tab-nav">
      {TABS.map(tab => {
        if (tab.adminOnly && !isAdmin) return null;
        return (
          <button
            key={tab.key}
            className={`tab-btn${state.curTab === tab.key ? ' active' : ''}`}
            onClick={() => dispatch({ type: 'SET_TAB', payload: tab.key })}
          >
            <span className="tab-icon">{tab.icon}</span>
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}
