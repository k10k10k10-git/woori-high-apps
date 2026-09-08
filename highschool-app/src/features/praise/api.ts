import { auth } from "@/lib/firebase";
import type { PraiseCommand, PraiseCreateRequest, PraiseMeta, PraiseRosterLink, PraiseView } from "./types";

export class PraiseApiError extends Error {
  constructor(message: string, public status: number, public code?: string) { super(message); this.name = "PraiseApiError"; }
}
export function praiseOperationId(): string { return crypto.randomUUID(); }
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new PraiseApiError("로그인 후 다시 시도해 주세요.", 401);
  const token = await user.getIdToken();
  if (auth.currentUser?.uid !== user.uid) throw new PraiseApiError("로그인 계정이 바뀌었습니다. 새로고침해 주세요.", 401);
  const response = await fetch(path, { ...options, cache: "no-store", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` } });
  const body = await response.json().catch(() => null);
  if (auth.currentUser?.uid !== user.uid) throw new PraiseApiError("로그인 계정이 바뀌었습니다. 새로고침해 주세요.", 401);
  if (!response.ok) throw new PraiseApiError(typeof body?.error === "string" ? body.error : body?.error?.message || body?.message || "찬양팀 기록을 불러오지 못했습니다. 다시 시도해 주세요.", response.status, body?.code);
  return body as T;
}
export function listPraiseWorkspaces(signal?: AbortSignal) { return request<{ workspaces: PraiseMeta[]; canCreate: boolean }>("/api/praise", { signal }); }
export function createPraiseWorkspace(workspace: PraiseCreateRequest["workspace"], operationId = praiseOperationId()) { return request<{ workspaceId: string }>("/api/praise", { method: "POST", body: JSON.stringify({ operationId, workspace }) }); }
export function loadPraiseWorkspace(workspaceId: string, signal?: AbortSignal) { return request<PraiseView>(`/api/praise/${encodeURIComponent(workspaceId)}`, { signal }); }
export function listPraiseAccounts(workspaceId: string, signal?: AbortSignal) { return request<{ accounts: { uid: string; name: string; roleLabel: string; email?: string }[] }>(`/api/praise/${encodeURIComponent(workspaceId)}/accounts`, { signal }); }
export function listPraiseReferences(workspaceId: string, signal?: AbortSignal) { return request<{ semesters: { id: string; title: string; startDate?: string; endDate?: string; teams: { id: string; name: string }[] }[] }>(`/api/praise/${encodeURIComponent(workspaceId)}/references`, { signal }); }
export function listPraiseCreateReferences(signal?: AbortSignal) { return request<{ semesters: { id: string; title: string; startDate?: string; endDate?: string; teams: { id: string; name: string }[] }[] }>("/api/praise/references", { signal }); }
export function listPraiseRoster(workspaceId: string, signal?: AbortSignal) { return request<{ people: { applicationKey: string; kind: "STUDENT" | "STAFF"; name: string; grade: number; department: "FIRST" | "SECOND"; rosterLink: PraiseRosterLink }[]; semesterHref: string | null }>(`/api/praise/${encodeURIComponent(workspaceId)}/roster`, { signal }); }
export function executePraiseCommand(workspaceId: string, command: PraiseCommand, operationId = praiseOperationId()) { return request<{ view: PraiseView; logPending: boolean }>(`/api/praise/${encodeURIComponent(workspaceId)}`, { method: "POST", body: JSON.stringify({ operationId, command }) }); }

/** 조회만 수행한다. 숨긴 탭에서는 멈추고, 해제·수정 시 진행 중 조회를 취소한다. */
export function subscribePraiseWorkspace(workspaceId: string, onData: (view: PraiseView) => void, onError: (error: Error) => void) {
  let controller: AbortController | null = null;
  let disposed = false;
  let paused = false;
  let sequence = 0;
  const refresh = async () => {
    if (disposed || paused || document.visibilityState === "hidden") return;
    controller?.abort();
    controller = new AbortController();
    const requestSequence = ++sequence;
    try {
      const view = await loadPraiseWorkspace(workspaceId, controller.signal);
      if (!disposed && !paused && requestSequence === sequence) onData(view);
    } catch (error) {
      if (!disposed && !paused && requestSequence === sequence && !(error instanceof Error && error.name === "AbortError")) {
        if (error instanceof PraiseApiError && error.code === "server_not_configured") paused = true;
        onError(error instanceof Error ? error : new Error("기록을 불러오지 못했습니다."));
      }
    }
  };
  const onFocus = () => { void refresh(); };
  const timer = setInterval(onFocus, 15_000);
  window.addEventListener("focus", onFocus);
  document.addEventListener("visibilitychange", onFocus);
  void refresh();
  return {
    refresh,
    pause() { paused = true; sequence++; controller?.abort(); },
    resume() { paused = false; },
    dispose() { disposed = true; sequence++; controller?.abort(); clearInterval(timer); window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onFocus); },
  };
}
