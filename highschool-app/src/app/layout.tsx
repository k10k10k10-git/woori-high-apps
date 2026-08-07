import type { Metadata } from "next";
import "./globals.css";
import Providers from "./providers";
import UpdateBanner from "./UpdateBanner";
import GlobalPortalHeader from "@/features/portal/GlobalPortalHeader";

export const metadata: Metadata = {
  title: "분당우리교회 서현고등부",
  description: "분당우리교회 서현고등부 학기·수련회 통합 사역 플랫폼",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
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
          <GlobalPortalHeader />
          {children}
        </Providers>
      </body>
    </html>
  );
}
