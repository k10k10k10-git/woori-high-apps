"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { executePraiseCommand, praiseOperationId, subscribePraiseWorkspace } from "./api";
import type { PraiseCommand, PraiseView } from "./types";

export function usePraiseData(workspaceId: string, attendanceMeeting?: string) {
  const [snapshot, setSnapshot] = useState<{ workspaceId: string; attendanceMeeting?: string; view: PraiseView } | null>(null);
  const [complete, setComplete] = useState<{ workspaceId: string; view: PraiseView } | null>(null);
  const view = snapshot?.workspaceId === workspaceId ? snapshot.view : null;
  const fullView = complete?.workspaceId === workspaceId ? complete.view : null;
  const scopeReady = Boolean(view && snapshot?.attendanceMeeting === attendanceMeeting);
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const writing = useRef(false);
  const retry = useRef<{ workspaceId: string; signature: string; operationId: string } | null>(null);
  const selected = useRef({ workspaceId, attendanceMeeting });
  const subscription = useRef<ReturnType<typeof subscribePraiseWorkspace> | null>(null);
  useEffect(() => {
    const scope = { workspaceId, attendanceMeeting };
    selected.current = scope;
    setError(""); setErrorCode(""); setNotice("");
    if (!workspaceId) return;
    const current = subscribePraiseWorkspace(workspaceId, (next) => {
      if (selected.current !== scope) return;
      setSnapshot({ ...scope, view: next });
      if (attendanceMeeting === undefined) setComplete({ workspaceId, view: next });
      setError(""); setErrorCode("");
    }, (failure) => {
      if (selected.current !== scope) return;
      if ("status" in failure && (failure.status === 401 || failure.status === 403)) { setSnapshot(null); setComplete(null); }
      setError(failure.message); setErrorCode("code" in failure && typeof failure.code === "string" ? failure.code : "");
    }, attendanceMeeting);
    subscription.current = current;
    return () => { current.dispose(); if (subscription.current === current) subscription.current = null; };
  }, [workspaceId, attendanceMeeting]);
  const execute = useCallback(async (command: PraiseCommand) => {
    if (writing.current || !workspaceId || !scopeReady) return false;
    writing.current = true; setBusy(true); setError(""); setErrorCode(""); setNotice("");
    const signature = JSON.stringify(command);
    if (retry.current?.workspaceId !== workspaceId || retry.current.signature !== signature) retry.current = { workspaceId, signature, operationId: praiseOperationId() };
    const operationId = retry.current.operationId;
    const current = subscription.current;
    const scope = selected.current;
    current?.pause();
    try {
      const result = await executePraiseCommand(workspaceId, command, operationId, attendanceMeeting);
      if (retry.current?.operationId === operationId) retry.current = null;
      if (selected.current === scope) {
        setSnapshot({ ...scope, view: result.view });
        if (attendanceMeeting === undefined) setComplete({ workspaceId, view: result.view });
        setNotice(result.logPending ? "업무 기록은 저장되었습니다. 통합 활동 로그 반영은 지연 중입니다." : "저장했습니다.");
      }
      return true;
    } catch (failure) {
      if (selected.current === scope) {
        if (failure instanceof Error && "status" in failure && (failure.status === 401 || failure.status === 403)) { setSnapshot(null); setComplete(null); }
        setError(failure instanceof Error ? failure.message : "저장하지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요.");
        setErrorCode(failure instanceof Error && "code" in failure && typeof failure.code === "string" ? failure.code : "");
      }
      return false;
    } finally { writing.current = false; setBusy(false); current?.resume(); }
  }, [workspaceId, attendanceMeeting, scopeReady]);
  return { view, fullView, scopeReady, error, errorCode, notice, busy, execute, refresh: () => subscription.current?.refresh() };
}
