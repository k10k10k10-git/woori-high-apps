import type { Metadata, Viewport } from "next";
import "./globals.css";
import Providers from "./providers";
import UpdateBanner from "./UpdateBanner";

export const metadata: Metadata = {
  title: "고등부 수련회 이동가이드",
  description: "고등부 수련회 이동 동선·안전 관리",
};

// 모바일 우선: 현장 실행 화면이 폰 기준이므로 뷰포트를 명시
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <UpdateBanner />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
