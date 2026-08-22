"use client";

import { useEffect, useState } from "react";

export default function ConnectivityBanner() {
  const [online, setOnline] = useState(() => typeof navigator === "undefined" ? true : navigator.onLine);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    function handleOffline() {
      setOnline(false);
      setRestored(false);
    }
    function handleOnline() {
      setOnline(true);
      setRestored(true);
      window.setTimeout(() => setRestored(false), 3500);
    }
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  if (online && !restored) return null;
  return (
    <div role="status" aria-live="polite" className={online ? "connectivity-banner connectivity-banner--online" : "connectivity-banner connectivity-banner--offline"}>
      {online ? "인터넷이 다시 연결되었습니다." : "오프라인 상태입니다. 화면을 닫지 말고 연결 후 다시 저장해 주세요."}
    </div>
  );
}
