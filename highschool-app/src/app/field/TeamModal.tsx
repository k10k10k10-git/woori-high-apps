"use client";
import { useEffect, useRef, useState } from "react";
import {
  subscribeToIguardPending, subscribeToIguardMembers, subscribeToIguardRoles,
  approveIguardMember, denyIguardPending, removeIguardMember, setIguardRole,
  updateIguardMemberName,
  IguardPendingReq, IguardMemberInfo, IguardRole,
} from "@/features/iguard/lib/db";
import { useUI } from "@/context/UIContext";

const ROLE_LABEL: Record<IguardRole, string> = { team: "이가드팀", staff: "스탭" };
const MAIN_ADMIN = {
  name: "김성훈",
  email: "smilegate1108@gmail.com",
};

export default function TeamModal({ onClose, myEmail }: { onClose: () => void; myEmail?: string | null }) {
  const { toast, uiConfirm } = useUI();
  const [pending, setPending] = useState<IguardPendingReq[]>([]);
  const [members, setMembers] = useState<Record<string, IguardMemberInfo>>({});
  const [roles, setRoles] = useState<Record<string, IguardRole>>({});
  const [editingUid, setEditingUid] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftEmail, setDraftEmail] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);

  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // onError 없으면 권한 오류 시 "대기자 0명"과 구분이 안 된다 (패턴 16)
    const fail = (e: Error) => setLoadError(prev => prev ?? `명단 구독 실패 — ${e.message}`);
    const u1 = subscribeToIguardPending(setPending, fail);
    const u2 = subscribeToIguardMembers(setMembers, fail);
    const u3 = subscribeToIguardRoles(setRoles, fail);
    return () => { u1(); u2(); u3(); };
  }, []);

  // ESC 키로 닫기 + 포커스 트랩
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key === "Tab" && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault(); last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault(); first.focus();
        }
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      prev?.focus();
    };
  }, [onClose]);

  async function approve(r: IguardPendingReq, role: IguardRole) {
    try { await approveIguardMember(r.uid, r.email, role, r.name); toast(`${r.name || r.email} → ${ROLE_LABEL[role]} 승인`, "success"); }
    catch (e) { toast(`승인 오류: ${e instanceof Error ? e.message : String(e)}`, "error"); }
  }
  async function deny(r: IguardPendingReq) {
    if (!await uiConfirm(`${r.name || r.email} 요청을 거절할까요?`)) return;
    try { await denyIguardPending(r.uid); } catch (e) { toast(`오류: ${e}`, "error"); }
  }
  async function changeRole(uid: string, role: IguardRole) {
    try { await setIguardRole(uid, role); } catch (e) { toast(`오류: ${e instanceof Error ? e.message : String(e)}`, "error"); }
  }
  function openNameEditor(uid: string, member: IguardMemberInfo) {
    setEditingUid(uid);
    setDraftName(member.name || "");
    setDraftEmail(member.email || "");
  }
  async function saveName(uid: string, member: IguardMemberInfo) {
    try {
      await updateIguardMemberName(uid, draftEmail || member.email, draftName);
      setEditingUid(null);
      toast("이름을 수정했습니다.", "success");
    }
    catch (e) { toast(`이름 수정 오류: ${e instanceof Error ? e.message : String(e)}`, "error"); }
  }
  async function kick(uid: string, member: IguardMemberInfo) {
    if (!await uiConfirm(`${member.name || member.email} 팀원을 제거할까요? (접속 차단됩니다)`)) return;
    try { await removeIguardMember(uid); } catch (e) { toast(`오류: ${e}`, "error"); }
  }

  const memberList = Object.entries(members)
    .filter(([, member]) => member.email !== MAIN_ADMIN.email)
    .sort(([, a], [, b]) => (a.name || a.email).localeCompare(b.name || b.email, "ko"));

  return (
    <div ref={dialogRef} className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label="팀원 관리" tabIndex={-1}>
      <div className="card p-6 w-full max-w-md modal-card max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg">팀원 관리</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none" aria-label="닫기">×</button>
        </div>

        {loadError && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-2.5 text-xs text-red-700">
            ⚠ {loadError} — 아래 명단이 비어 보여도 실제 상태가 아닐 수 있습니다.
          </div>
        )}

        <div className="mb-5">
          <h4 className="text-sm font-semibold text-fuchsia-700 mb-2">👑 관리자</h4>
          <div className="bg-fuchsia-50 border border-fuchsia-100 rounded-lg px-3 py-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <div className="text-sm font-semibold text-slate-800 truncate">{MAIN_ADMIN.name}</div>
              <span className="text-[11px] px-1.5 py-0.5 rounded border border-fuchsia-200 bg-white text-fuchsia-700 shrink-0">관리자</span>
            </div>
            <div className="text-xs text-slate-500 truncate mt-0.5">{MAIN_ADMIN.email}</div>
          </div>
        </div>

        <div className="mb-4 bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-[11px] text-slate-500 leading-relaxed">
          <strong className="text-slate-600">이가드팀</strong> = 실행·기획·정보 전부 편집 / <strong className="text-slate-600">스탭</strong> = 실행 탭만 (기획·정보 숨김)
        </div>

        {/* 승인 대기 */}
        <div className="mb-5">
          <div className="text-sm font-semibold text-slate-600 mb-2">⏳ 승인 대기 ({pending.length}명)</div>
          {pending.length === 0 ? (
            <p className="text-xs text-slate-400 px-1">대기 중인 요청이 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {pending.map(r => (
                <div key={r.uid} className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-800 truncate">{r.name || "(이름 없음)"}</div>
                      <div className="text-xs text-slate-500 truncate">{r.email}</div>
                    </div>
                    <button onClick={() => deny(r)} className="text-xs text-slate-400 hover:text-red-500 px-1">거절</button>
                  </div>
                  <div className="flex gap-1.5 mt-2">
                    <button onClick={() => approve(r, "team")} className="btn-primary btn-sm flex-1 justify-center">이가드팀 승인</button>
                    <button onClick={() => approve(r, "staff")} className="btn-secondary btn-sm flex-1 justify-center">스탭 승인</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 승인된 팀원 */}
        <div>
          <div className="text-sm font-semibold text-slate-600 mb-2">✅ 승인된 팀원 ({memberList.length}명)</div>
          {memberList.length === 0 ? (
            <p className="text-xs text-slate-400 px-1">아직 승인된 팀원이 없습니다.</p>
          ) : (
            <div className="space-y-1.5">
              {memberList.map(([uid, member]) => {
                const role: IguardRole = roles[uid] === "staff" ? "staff" : "team";
                return (
                  <div key={uid} className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-700 truncate">{member.name || member.email || "(이름만 저장됨)"}</span>
                          <button onClick={() => openNameEditor(uid, member)} className="btn-secondary btn-sm shrink-0">이름 수정</button>
                        </div>
                        <div className="text-xs text-slate-400 truncate mt-0.5">{member.email || "이메일 정보 없음"}</div>
                      </div>
                      <div className="flex gap-0.5 bg-slate-200/60 rounded-md p-0.5 shrink-0">
                        {(["team", "staff"] as const).map(rk => (
                          <button key={rk} onClick={() => changeRole(uid, rk)}
                            className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${role === rk ? "bg-white shadow text-slate-800" : "text-slate-500"}`}>
                            {ROLE_LABEL[rk]}
                          </button>
                        ))}
                      </div>
                      {myEmail === member.email ? (
                        <span className="text-xs text-slate-400 shrink-0">나</span>
                      ) : (
                        <button onClick={() => kick(uid, member)} className="text-slate-300 hover:text-red-400 text-sm leading-none shrink-0" aria-label={`${member.name || member.email} 팀원 제거`}>×</button>
                      )}
                    </div>
                    {editingUid === uid && (
                      <div className="mt-2 grid gap-1.5 sm:grid-cols-[1fr_1.4fr_auto_auto]">
                        <input
                          className="input text-sm"
                          placeholder="표시 이름"
                          value={draftName}
                          onChange={e => setDraftName(e.target.value)}
                          autoFocus
                        />
                        <input
                          className="input text-sm"
                          placeholder="이메일"
                          value={draftEmail}
                          onChange={e => setDraftEmail(e.target.value)}
                        />
                        <button onClick={() => saveName(uid, member)} className="btn-primary btn-sm">저장</button>
                        <button onClick={() => setEditingUid(null)} className="btn-secondary btn-sm">취소</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <p className="text-xs text-slate-400 mt-4">팀원이 로그인 후 <strong>&apos;접근 요청 보내기&apos;</strong>를 누르면 여기서 승인할 수 있습니다.</p>
      </div>
    </div>
  );
}
