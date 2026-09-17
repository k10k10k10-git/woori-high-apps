import type { Metadata, Viewport } from 'next';
import { AppProvider } from '@/store/AppContext';
import AppShell from '@/components/AppShell';
import InstallPrompt from '@/components/InstallPrompt';
import './globals.css';

export const metadata: Metadata = {
  title: '고등부 출석부',
  description: '분당우리교회 서현고등부 출석 관리',
  manifest: '/manifest.json',
};

export const viewport: Viewport = {
  themeColor: '#9B8DD4',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body>
        <AppProvider>
          <AppShell>{children}</AppShell>
          <InstallPrompt />
        </AppProvider>
      </body>
    </html>
  );
}
