"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useViewMode } from "@/context/ViewModeContext";
import ConnectivityBanner from "@/app/ConnectivityBanner";
import SuggestionResolutionNotifier from "@/features/suggestions/SuggestionResolutionNotifier";
import GlobalPortalHeader from "@/features/portal/GlobalPortalHeader";
import {
  buildDesktopFrameSrc,
  DESKTOP_FRAME_NAME,
  DESKTOP_FRAME_QUERY_KEY,
  DESKTOP_FRAME_QUERY_VALUE,
  shouldUseDesktopFrame,
  shouldUseMobilePreview,
  stripDesktopFrameSearch,
} from "@/context/viewMode";

function DesktopPortalFrame({
  initialSrc,
  frameRef,
}: {
  initialSrc: string;
  frameRef: RefObject<HTMLIFrameElement | null>;
}) {
  // 바깥 URL은 프레임의 현재 위치를 따라가지만 이미 열린 프레임의 src는 고정한다.
  // 그래야 내부 링크 이동 때 동일 페이지를 다시 불러오지 않는다.
  const [src] = useState(initialSrc);
  return (
    <iframe
      ref={frameRef}
      className="portal-desktop-lock-frame"
      name={DESKTOP_FRAME_NAME}
      src={src}
      title="고등부 통합사이트 PC 화면"
    />
  );
}

/**
 * PC·모바일 수동 보기는 CSS로 같은 DOM을 접었다 펴지 않는다. 같은 출처의
 * 고정 뷰포트 iframe이 각 모드의 미디어 쿼리와 React 분기를 처음부터 실행한다.
 * iframe 안에서도 같은 Firebase 인증 저장소를 쓰므로 별도 로그인이나 DB 복제가 없다.
 */
export default function PortalViewportShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const frameRef = useRef<HTMLIFrameElement>(null);
  const { mode, isViewportMobile } = useViewMode();
  const isEmbeddedDesktopFrame =
    searchParams.get(DESKTOP_FRAME_QUERY_KEY) === DESKTOP_FRAME_QUERY_VALUE ||
    (typeof window !== "undefined" && window.name === DESKTOP_FRAME_NAME);
  const isMobilePreview = shouldUseMobilePreview(mode, isViewportMobile);
  const isDesktopFrame = shouldUseDesktopFrame(mode, isEmbeddedDesktopFrame);
  const isFramedView = isMobilePreview || isDesktopFrame;
  const currentDesktopFrameSrc = buildDesktopFrameSrc(pathname, searchParams.toString());

  // 모바일 프레임 안에서 이동한 URL을 바깥 주소에도 반영한다. 그래야 PC버전으로
  // 돌아갈 때 방금 보고 있던 업무 화면이 그대로 열린다. 같은 출처만 읽고 쓰기는 없다.
  useEffect(() => {
    if (!isFramedView) return;
    const timer = window.setInterval(() => {
      try {
        const frameLocation = frameRef.current?.contentWindow?.location;
        if (!frameLocation || frameLocation.origin !== window.location.origin) return;
        const nextSearch = stripDesktopFrameSearch(frameLocation.search);
        const nextLocation = `${frameLocation.pathname}${nextSearch}${frameLocation.hash}`;
        const currentLocation = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        if (nextLocation !== currentLocation) router.replace(nextLocation, { scroll: false });
      } catch {
        // 로딩 중이거나 브라우저가 일시적으로 프레임 접근을 막아도 다음 주기에 재확인한다.
      }
    }, 350);
    return () => window.clearInterval(timer);
  }, [isFramedView, router]);

  if (isEmbeddedDesktopFrame) {
    return (
      <>
        <ConnectivityBanner />
        <SuggestionResolutionNotifier />
        <GlobalPortalHeader />
        <div className="portal-content-frame">{children}</div>
      </>
    );
  }

  if (isDesktopFrame) {
    return (
      <main className="portal-desktop-lock-stage" aria-label="PC 화면 고정 보기">
        <DesktopPortalFrame initialSrc={currentDesktopFrameSrc} frameRef={frameRef} />
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
