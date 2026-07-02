import type { Metadata } from 'next';
import { AppProvider } from '@/store/AppContext';
import './globals.css';

export const metadata: Metadata = {
  title: '교사/스탭 출석부',
  description: '분당우리교회 고등부 교사/스탭 출석부',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}
