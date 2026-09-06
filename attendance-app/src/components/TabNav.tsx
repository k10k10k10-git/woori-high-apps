'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useApp } from '@/store/AppContext';
import AdminIcon, { type AdminIconName } from '@/components/admin/AdminIcon';

const TABS: Array<{ path: string; icon: AdminIconName; label: string; adminOnly?: boolean }> = [
  { path: '/attendance', icon: 'calendar', label: '출석' },
  { path: '/stats', icon: 'chart', label: '통계' },
  { path: '/manage', icon: 'users', label: '관리' },
  { path: '/overall', icon: 'layers', label: '전체', adminOnly: true },
  { path: '/admin', icon: 'settings', label: '설정', adminOnly: true },
];

export default function TabNav() {
  const pathname = usePathname();
  const { state } = useApp();
  const isAdmin = !state.userRole || state.userRole.role === 'admin';

  return (
    <nav className="tab-nav" aria-label="메인 메뉴">
      {TABS.map(tab => {
        if (tab.adminOnly && !isAdmin) return null;
        const isActive = pathname === tab.path;
        return (
          <Link
            key={tab.path}
            href={tab.path}
            aria-current={isActive ? 'page' : undefined}
            aria-label={`${tab.label} 페이지`}
            className={`tab-btn${isActive ? ' active' : ''}`}
          >
            <span className="tab-icon" aria-hidden="true"><AdminIcon name={tab.icon} size={19} /></span>
            <span className="tab-label">{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
