import type { PraiseCommand, PraiseGroupVersion, PraiseMeeting, PraiseView } from "../types";
export type PraiseEditorProps = { view: PraiseView; execute: (command: PraiseCommand) => Promise<boolean>; busy: boolean };
export type PraiseMeetingProps = PraiseEditorProps & { meeting: PraiseMeeting | null };
export function praiseDataWriteLocked(view: PraiseView): boolean {
  return view.meta.status === "archived" || view.meta.mode === "shadow" || (view.meta.mode === "setup" && !view.permissions.manage);
}
/** 원본 대조 중에도 관리자는 기존 팀원의 최초 원장 연결과 찬양팀 전용 설정을 정리할 수 있다. */
export function praisePersonWriteLocked(view: PraiseView): boolean {
  return view.meta.status === "archived" || !view.permissions.manage;
}
export function hasUnresolvedImportedGroup(view: PraiseView, meeting?: PraiseMeeting | null): boolean {
  if (!meeting) return false;
  if (meeting.groupVersionId) return meeting.groupVersionId === "import-unresolved";
  return Boolean((view.meta.sourceAsOf && meeting.updatedBy.startsWith("supabase:"))
    || Object.values(view.attendance[meeting.id] ?? {}).some((record) => record.groupVersionId === "import-unresolved"));
}
export function latestGroups(view: PraiseView, meeting?: PraiseMeeting | null): PraiseGroupVersion | undefined {
  // 원본 회차의 과거 조가 확인되지 않았으면 현재 조를 당시 조로 표시하지 않는다.
  if (hasUnresolvedImportedGroup(view, meeting)) return undefined;
  const id = meeting?.groupVersionId || view.meta.activeGroupVersionId;
  return view.groups.find((group) => group.id === id && group.kind === "CONFIRMED");
}
export function personName(view: PraiseView, id: string) { return view.people.find((person) => person.id === id)?.name || "연결되지 않은 팀원"; }
export function stampTime(at: number) { return at ? new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(at) : ""; }
export function sourceTime(value: string) { const date = new Date(value); return Number.isFinite(date.valueOf()) ? `${new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(date)} (한국 시간)` : "기준 시각 미확인"; }
export function authorName(view: PraiseView, uid: string) { if (uid.startsWith("supabase:")) return "외부 사이트 기록"; const linked = view.access.find((access) => access.uid === uid); return linked ? personName(view, linked.staffId) : view.audit.find((event) => event.actor.uid === uid)?.actor.name || `계정 ${uid.slice(0, 6)}`; }
export function Empty({ children }: { children: React.ReactNode }) { return <div className="praise-empty">{children}</div>; }
export function WarningList({ warnings }: { warnings: string[] }) { return warnings.length > 0 ? <div className="praise-warning" role="status"><strong>확인할 조건 {warnings.length}개</strong><ul>{warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></div> : null; }
