'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useApp } from '@/store/AppContext';

const TABS = [
  { path: '/attendance', icon: '📅', label: '출석' },
  { path: '/stats', icon: '📊', label: '통계' },
  { path: '/manage', icon: '👥', label: '관리' },
  { path: '/overall', icon: '🗂', label: '전체', adminOnly: true },
  { path: '/admin', icon: '⚙️', label: '설정', adminOnly: true },
];

export default function TabNav() {
  const pathname = usePathname();
  const { state } = useApp();
  const isAdmin = !state.userRole || state.userRole.role === 'admin';

  return (
    <nav className="tab-nav" role="tablist" aria-label="메인 탭 내비게이션">
      {TABS.map(tab => {
        if (tab.adminOnly && !isAdmin) return null;
        const isActive = pathname === tab.path;
        return (
          <Link
            key={tab.path}
            href={tab.path}
            role="tab"
            aria-selected={isActive}
            aria-label={`${tab.label} 탭`}
            className={`tab-btn${isActive ? ' active' : ''}`}
          >
            <span className="tab-icon" aria-hidden="true">{tab.icon}</span>
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
