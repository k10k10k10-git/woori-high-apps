"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useViewMode } from "@/context/ViewModeContext";
import ConnectivityBanner from "@/app/ConnectivityBanner";
import SuggestionResolutionNotifier from "@/features/suggestions/SuggestionResolutionNotifier";
import GlobalPortalHeader from "@/features/portal/GlobalPortalHeader";
import { shouldLockDesktopViewport, shouldUseMobilePreview } from "@/context/viewMode";

/**
 * PC의 모바일 미리보기는 CSS로 데스크톱 레이아웃을 접지 않는다.
 * 같은 출처의 실제 430px iframe을 열어 모바일 미디어 쿼리와 모바일 전용
 * React 분기를 휴대폰과 똑같이 실행한다. iframe 안에서도 같은 Firebase 인증
 * 저장소를 사용하므로 별도 로그인이나 DB 복제가 필요하지 않다.
 */
export default function PortalViewportShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const frameRef = useRef<HTMLIFrameElement>(null);
  const { mode, isViewportMobile } = useViewMode();
  const isMobilePreview = shouldUseMobilePreview(mode, isViewportMobile);
  const isDesktopLocked = shouldLockDesktopViewport(mode, isViewportMobile);
  const isFramedView = isMobilePreview || isDesktopLocked;

  // 모바일 프레임 안에서 이동한 URL을 바깥 주소에도 반영한다. 그래야 PC버전으로
  // 돌아갈 때 방금 보고 있던 업무 화면이 그대로 열린다. 같은 출처만 읽고 쓰기는 없다.
  useEffect(() => {
    if (!isFramedView) return;
    const timer = window.setInterval(() => {
      try {
        const frameLocation = frameRef.current?.contentWindow?.location;
        if (!frameLocation || frameLocation.origin !== window.location.origin) return;
        const nextLocation = `${frameLocation.pathname}${frameLocation.search}${frameLocation.hash}`;
        const currentLocation = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        if (nextLocation !== currentLocation) router.replace(nextLocation, { scroll: false });
      } catch {
        // 로딩 중이거나 브라우저가 일시적으로 프레임 접근을 막아도 다음 주기에 재확인한다.
      }
    }, 350);
    return () => window.clearInterval(timer);
  }, [isFramedView, router]);

  if (isDesktopLocked) {
    return (
      <main className="portal-desktop-lock-stage" aria-label="PC 화면 고정 보기">
        <iframe
          ref={frameRef}
          className="portal-desktop-lock-frame"
          src={pathname}
          title="고등부 통합사이트 PC 화면"
        />
      </main>
    );
  }

  if (isMobilePreview) {
    return (
      <>
        <GlobalPortalHeader />
        <main className="portal-mobile-preview-stage" aria-label="모바일 화면 미리보기">
          <iframe
            ref={frameRef}
            className="portal-mobile-preview-frame"
            src={pathname}
            title="고등부 통합사이트 모바일 화면"
          />
        </main>
      </>
    );
  }

  return (
    <>
      <ConnectivityBanner />
      <SuggestionResolutionNotifier />
      <GlobalPortalHeader />
      <div className="portal-content-frame">{children}</div>
    </>
  );
}
