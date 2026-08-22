"use client";

import { useEffect, useReducer } from "react";
import { subscribeToConnection } from "@/lib/db";
import {
  INITIAL_CONNECTIVITY_BANNER_STATE,
  reduceConnectivityBanner,
} from "@/lib/connectivity";

const INITIAL_CONNECTION_GRACE_MS = 3000;
const RESTORED_NOTICE_MS = 3500;

export default function ConnectivityBanner() {
  const [state, dispatch] = useReducer(
    reduceConnectivityBanner,
    INITIAL_CONNECTIVITY_BANNER_STATE,
  );

  useEffect(() => {
    const unsubscribe = subscribeToConnection((connected) => {
      dispatch({ type: "connection-changed", connected });
    });
    const graceTimer = window.setTimeout(() => {
      dispatch({ type: "grace-elapsed" });
    }, INITIAL_CONNECTION_GRACE_MS);

    return () => {
      unsubscribe();
      window.clearTimeout(graceTimer);
    };
  }, []);

  useEffect(() => {
    if (state.mode !== "restored") return;
    const restoredTimer = window.setTimeout(() => {
      dispatch({ type: "restored-notice-expired" });
    }, RESTORED_NOTICE_MS);
    return () => window.clearTimeout(restoredTimer);
  }, [state.mode]);

  if (state.mode === "hidden") return null;
  const restored = state.mode === "restored";
  return (
    <div role="status" aria-live="polite" className={restored ? "connectivity-banner connectivity-banner--online" : "connectivity-banner connectivity-banner--offline"}>
      {restored ? "서버 연결이 복구되었습니다." : "서버 연결이 끊겼습니다. 화면을 닫지 말고 연결 후 다시 저장해 주세요."}
    </div>
  );
}
