import type { ReactNode } from 'react';

export type AdminIconName = 'dashboard' | 'calendar' | 'users' | 'chart' | 'layers' | 'settings' | 'chevron' | 'search' | 'arrow' | 'check' | 'clock' | 'logout' | 'book' | 'signal';

const shapes: Record<AdminIconName, ReactNode> = {
  dashboard: <><rect x="3" y="3" width="7" height="7" rx="1.4" /><rect x="14" y="3" width="7" height="7" rx="1.4" /><rect x="3" y="14" width="7" height="7" rx="1.4" /><rect x="14" y="14" width="7" height="7" rx="1.4" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 11h18M8 15h2M14 15h2" /></>,
  users: <><circle cx="9" cy="8" r="3" /><path d="M3 21v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 4v2" /></>,
  chart: <><path d="M4 3v18h17M9 16v-5M14 16V6M19 16v-8" /></>,
  layers: <><path d="m12 3 10 6-10 6L2 9l10-6ZM2 14l10 6 10-6" /></>,
  settings: <><path d="M4 7h16M4 17h16M9 4v6M15 14v6" /><circle cx="9" cy="7" r="2" fill="currentColor" stroke="none" /><circle cx="15" cy="17" r="2" fill="currentColor" stroke="none" /></>,
  chevron: <path d="m9 5 7 7-7 7" />,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
  arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
  check: <path d="m5 12 4 4L19 6" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  logout: <><path d="M10 4H4v16h6M9 12h12m-4-4 4 4-4 4" /></>,
  book: <><path d="M12 6v15M12 6C9 3 5 3 2 4v15c4-1 7-1 10 2 3-3 6-3 10-2V4c-3-1-7-1-10 2Z" /></>,
  signal: <><path d="M4 19v-3M9 19v-6M14 19V9M19 19V5" /></>,
};

export default function AdminIcon({ name, size = 16, className }: { name: AdminIconName; size?: number; className?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" className={className}>{shapes[name]}</svg>;
}
