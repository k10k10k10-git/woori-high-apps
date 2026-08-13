"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { useUI } from "@/context/UIContext";
import { getMyUnnotifiedResolvedRequests, markSiteRequestNotified } from "./db";

/** 로그인 세션 시작 때 한 번만 확인한다. 현재 세션 중 해결된 요청은 다음 로그인에서 알린다. */
export default function SuggestionResolutionNotifier() {
  const { user, loading } = useAuth();
  const { toast } = useUI();
  const checkedUid = useRef<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      checkedUid.current = null;
      return;
    }
    if (checkedUid.current === user.uid) return;
    checkedUid.current = user.uid;
    let alive = true;
    void getMyUnnotifiedResolvedRequests(user.uid)
      .then(async (requests) => {
        if (!alive) return;
        for (const request of requests) {
          toast(`요청한 건의사항이 해결되었습니다: ${request.title}`, "success");
          await markSiteRequestNotified(user.uid, request.id);
        }
      })
      .catch((error) => console.warn("건의사항 해결 알림 확인 실패:", error));
    return () => { alive = false; };
  }, [loading, toast, user]);

  return null;
}
