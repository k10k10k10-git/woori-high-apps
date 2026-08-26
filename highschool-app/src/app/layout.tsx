import type { Metadata } from "next";
import "./globals.css";
import "./operations-tables.css";
import "./theme-compat.css";
import "./interaction-controls.css";
import Providers from "./providers";
import UpdateBanner from "./UpdateBanner";
import PortalViewportShell from "@/components/PortalViewportShell";

export const metadata: Metadata = {
  metadataBase: new URL("https://woorihigh-app.vercel.app"),
  title: "분당우리교회 서현고등부",
  description: "분당우리교회 서현고등부 학기·수련회 통합 사역 플랫폼",
  openGraph: {
    title: "분당우리교회 서현고등부",
    description: "학기 운영과 수련회 행정·현장을 하나로 연결하는 사역 플랫폼",
    type: "website",
    locale: "ko_KR",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            try {
              var savedTheme = localStorage.getItem('woori-high-theme');
              var theme = savedTheme === 'light' || savedTheme === 'dark'
                ? savedTheme
                : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
              document.documentElement.dataset.theme = theme;
              document.documentElement.style.colorScheme = theme;
            } catch (_) {
              document.documentElement.dataset.theme = 'light';
              document.documentElement.style.colorScheme = 'light';
            }
          })();
        `}} />
        {/*
          dangerouslySetInnerHTML 사용 이유:
          카카오톡, 네이버 등 인앱 브라우저에서 Firebase Auth(Google OAuth)가
          정상 작동하지 않으므로, 페이지 로드 즉시 외부 브라우저(Safari/Chrome)로
          리다이렉트해야 합니다. Next.js <Script> 컴포넌트는 head에 삽입이 불가하고
          로드 타이밍이 늦으므로, 인라인 스크립트로 처리합니다.
          주의: 이 스크립트는 정적 문자열이며 사용자 입력을 일체 포함하지 않습니다.
        */}
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            var ua = navigator.userAgent || '';
            if (/KAKAOTALK|NAVER|Line|Instagram|FB_IAB|FBAN|SamsungBrowser.*CrossApp/i.test(ua)
                && !/Chrome\\/[0-9]/.test(ua)) {
              if (/iPhone|iPad/i.test(ua)) {
                location.href = 'x-safari-' + location.href;
              } else {
                location.href = 'intent://' + location.href.replace(/^https?:\\/\\//, '')
                  + '#Intent;scheme=https;package=com.android.chrome;end';
              }
            }
          })();
        `}} />
      </head>
      <body>
        <UpdateBanner />
        <Providers>
          <PortalViewportShell>{children}</PortalViewportShell>
        </Providers>
      </body>
    </html>
  );
}
