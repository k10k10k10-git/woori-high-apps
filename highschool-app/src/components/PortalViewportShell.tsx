"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { usePathname, useSearchParams } from "next/navigation";
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
  onReady,
}: {
  initialSrc: string;
  frameRef: RefObject<HTMLIFrameElement | null>;
  onReady: () => void;
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
      onLoad={onReady}
    />
  );
}

function ViewportFrameLoading({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`portal-frame-loading ${compact ? "portal-frame-loading--compact" : ""}`} aria-hidden="true">
      <div className="portal-frame-loading__bar" />
      <div className="portal-frame-loading__hero" />
      <div className="portal-frame-loading__grid">
        <span /><span /><span />
      </div>
    </div>
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
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [loadedFrameKey, setLoadedFrameKey] = useState("");
  const routeLocation = `${pathname}${stripDesktopFrameSearch(`?${searchParams.toString()}`)}`;
  const [framedLocation, setFramedLocation] = useState(routeLocation);
  const { mode, isViewportMobile } = useViewMode();
  const isEmbeddedDesktopFrame =
    searchParams.get(DESKTOP_FRAME_QUERY_KEY) === DESKTOP_FRAME_QUERY_VALUE ||
    (typeof window !== "undefined" && window.name === DESKTOP_FRAME_NAME);
  const isMobilePreview = shouldUseMobilePreview(mode, isViewportMobile);
  const isDesktopFrame = shouldUseDesktopFrame(mode, isEmbeddedDesktopFrame);
  const isFramedView = isMobilePreview || isDesktopFrame;
  const framedUrl = new URL(framedLocation, "https://woori-high.local");
  const currentDesktopFrameSrc = `${buildDesktopFrameSrc(framedUrl.pathname, framedUrl.search)}${framedUrl.hash}`;
  const currentMobileFrameSrc = framedLocation;
  const frameKey = isDesktopFrame ? "desktop" : `mobile:${framedLocation}`;
  const frameReady = loadedFrameKey === frameKey;

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
        // 프레임의 작업 상태를 주소창에만 반영한다. Next가 패치한 history 메서드를
        // 호출하면 바깥 App Router까지 다시 탐색해 고정 iframe을 숨기므로, 브라우저
        // 원본 History 메서드로 현재 항목만 교체한다.
        if (nextLocation !== currentLocation) {
          History.prototype.replaceState.call(window.history, null, "", nextLocation);
          setFramedLocation(nextLocation);
        }
      } catch {
        // 로딩 중이거나 브라우저가 일시적으로 프레임 접근을 막아도 다음 주기에 재확인한다.
      }
    }, 350);
    return () => window.clearInterval(timer);
  }, [isFramedView]);

  // 바깥 주소가 뒤로가기나 탭 전환으로 먼저 바뀐 경우 프레임도 같은 위치로 맞춘다.
  // 프레임에서 시작된 이동은 현재 위치가 이미 같으므로 다시 로드하지 않는다.
  useEffect(() => {
    if (!isFramedView) return;
    const frameWindow = frameRef.current?.contentWindow;
    if (!frameWindow) return;
    try {
      const frameLocation = frameWindow.location;
      if (frameLocation.origin !== window.location.origin) return;
      const currentFrameLocation = `${frameLocation.pathname}${stripDesktopFrameSearch(frameLocation.search)}${frameLocation.hash}`;
      const nextFrameLocation = isDesktopFrame ? currentDesktopFrameSrc : currentMobileFrameSrc;
      const nextUrl = new URL(nextFrameLocation, window.location.origin);
      const normalizedNextLocation = `${nextUrl.pathname}${stripDesktopFrameSearch(nextUrl.search)}${nextUrl.hash}`;
      if (currentFrameLocation !== normalizedNextLocation) frameLocation.replace(nextFrameLocation);
    } catch {
      // 프레임이 로딩 중이면 onLoad 이후 다음 주소 변경에서 다시 맞춘다.
    }
  }, [currentDesktopFrameSrc, currentMobileFrameSrc, isDesktopFrame, isFramedView]);

  // 캐시된 iframe은 React가 onLoad를 연결하기 전에 로드를 끝낼 수 있다.
  // 실제 문서와 주소가 준비됐는지도 확인해 스켈레톤이 영구히 남지 않게 한다.
  useEffect(() => {
    if (!isFramedView) return;
    const expectedUrl = new URL(isDesktopFrame ? currentDesktopFrameSrc : currentMobileFrameSrc, window.location.origin);
    const expectedLocation = `${expectedUrl.pathname}${stripDesktopFrameSearch(expectedUrl.search)}${expectedUrl.hash}`;

    function markReadyWhenLoaded() {
      try {
        const frameWindow = frameRef.current?.contentWindow;
        const frameDocument = frameRef.current?.contentDocument;
        if (!frameWindow || !frameDocument || frameDocument.readyState !== "complete") return false;
        const frameLocation = `${frameWindow.location.pathname}${stripDesktopFrameSearch(frameWindow.location.search)}${frameWindow.location.hash}`;
        if (frameLocation !== expectedLocation) return false;
        setLoadedFrameKey(frameKey);
        return true;
      } catch {
        return false;
      }
    }

    if (markReadyWhenLoaded()) return;
    const timer = window.setInterval(() => {
      if (markReadyWhenLoaded()) window.clearInterval(timer);
    }, 120);
    return () => window.clearInterval(timer);
  }, [currentDesktopFrameSrc, currentMobileFrameSrc, frameKey, isDesktopFrame, isFramedView]);

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
      <main className="portal-desktop-lock-stage" aria-label="PC 화면 고정 보기" data-frame-ready={frameReady ? "true" : "false"}>
        {!frameReady && <ViewportFrameLoading />}
        <DesktopPortalFrame initialSrc={currentDesktopFrameSrc} frameRef={frameRef} onReady={() => setLoadedFrameKey(frameKey)} />
      </main>
    );
  }

  if (isMobilePreview) {
    return (
      <>
        <GlobalPortalHeader />
        <main className="portal-mobile-preview-stage" aria-label="모바일 화면 미리보기" data-frame-ready={frameReady ? "true" : "false"}>
          {!frameReady && <ViewportFrameLoading compact />}
          <iframe
            ref={frameRef}
            className="portal-mobile-preview-frame"
            src={currentMobileFrameSrc}
            title="고등부 통합사이트 모바일 화면"
            onLoad={() => setLoadedFrameKey(frameKey)}
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
