"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useUI } from "@/context/UIContext";
import {
  addRetreatAdmin,
  approveRetreatRequest,
  denyRetreatRequest,
  getPendingRequests,
  getRetreatAdmins,
  removeRetreatAdmin,
  updateRetreatAdminMemberName,
  type RetreatAdminMember,
} from "@/lib/db";
import {
  approveIguardMember,
  denyIguardPending,
  removeIguardMember,
  setIguardRole,
  subscribeToIguardMembers,
  subscribeToIguardPending,
  subscribeToIguardRoles,
  updateIguardMemberName,
  type IguardMemberInfo,
  type IguardPendingReq,
  type IguardRole,
} from "@/features/iguard/lib/db";

type UnifiedMember = {
  uid: string;
  email: string;
  name: string;
  admin?: RetreatAdminMember;
  iguard?: IguardMemberInfo;
  role?: IguardRole;
};

const MAIN_ADMIN_EMAIL = process.env.NEXT_PUBLIC_MAIN_ADMIN_EMAIL ?? "smilegate1108@gmail.com";

function memberLabel(member: UnifiedMember) {
  return member.name || member.email || "이름 미설정";
}

export default function UnifiedTeamModal({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const { toast, uiConfirm } = useUI();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [admins, setAdmins] = useState<Record<string, RetreatAdminMember>>({});
  const [adminPending, setAdminPending] = useState<Record<string, { email: string; name: string; requestedAt: number }>>({});
  const [iguardMembers, setIguardMembers] = useState<Record<string, IguardMemberInfo>>({});
  const [iguardPending, setIguardPending] = useState<IguardPendingReq[]>([]);
  const [roles, setRoles] = useState<Record<string, IguardRole>>({});
  const [editingUid, setEditingUid] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  async function loadAdminAccess() {
    try {
      const [nextAdmins, nextPending] = await Promise.all([getRetreatAdmins(), getPendingRequests()]);
      setAdmins(nextAdmins);
      setAdminPending(nextPending);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error));
    }
  }

  useEffect(() => {
    void loadAdminAccess();
    const fail = (error: Error) => setLoadError((current) => current ?? error.message);
    const unsubs = [
      subscribeToIguardMembers(setIguardMembers, fail),
      subscribeToIguardPending(setIguardPending, fail),
      subscribeToIguardRoles(setRoles, fail),
    ];
    return () => unsubs.forEach((unsubscribe) => unsubscribe());
  }, []);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus();
    };
  }, [onClose]);

  const members = useMemo<UnifiedMember[]>(() => {
    const ids = new Set([...Object.keys(admins), ...Object.keys(iguardMembers)]);
    return [...ids]
      .map((uid) => {
        const admin = admins[uid];
        const iguard = iguardMembers[uid];
        return {
          uid,
          admin,
          iguard,
          role: roles[uid],
          email: admin?.email || iguard?.email || "",
          name: admin?.name || iguard?.name || "",
        };
      })
      .filter((member) => member.email !== MAIN_ADMIN_EMAIL)
      .sort((a, b) => memberLabel(a).localeCompare(memberLabel(b), "ko"));
  }, [admins, iguardMembers, roles]);

  const pending = useMemo(() => {
    const ids = new Set([...Object.keys(adminPending), ...iguardPending.map((request) => request.uid)]);
    return [...ids]
      .map((uid) => ({
        uid,
        admin: adminPending[uid],
        iguard: iguardPending.find((request) => request.uid === uid),
      }))
      .sort((a, b) => Math.min(a.admin?.requestedAt ?? Infinity, a.iguard?.requestedAt ?? Infinity)
        - Math.min(b.admin?.requestedAt ?? Infinity, b.iguard?.requestedAt ?? Infinity));
  }, [adminPending, iguardPending]);

  async function run(uid: string, action: () => Promise<void>, success: string) {
    setBusyUid(uid);
    try {
      await action();
      await loadAdminAccess();
      toast(success, "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), "error");
    } finally {
      setBusyUid(null);
    }
  }

  async function toggleAdmin(member: UnifiedMember) {
    if (member.admin) {
      if (!await uiConfirm(`${memberLabel(member)}님의 행정·학기 권한을 해제할까요?`)) return;
      await run(member.uid, () => removeRetreatAdmin(member.uid), "행정·학기 권한을 해제했습니다.");
      return;
    }
    await run(member.uid, () => addRetreatAdmin(member.uid, member.email, member.name), "행정·학기 권한을 부여했습니다.");
  }

  async function changeIguardRole(member: UnifiedMember, role: IguardRole | "none") {
    if (member.admin) return;
    if (role === "none") {
      if (!member.iguard || !await uiConfirm(`${memberLabel(member)}님의 이가드 권한을 해제할까요?`)) return;
      await run(member.uid, () => removeIguardMember(member.uid), "이가드 권한을 해제했습니다.");
      return;
    }
    await run(
      member.uid,
      () => member.iguard
        ? setIguardRole(member.uid, role)
        : approveIguardMember(member.uid, member.email, role, member.name),
      role === "team" ? "이가드팀 권한을 부여했습니다." : "현장 스탭 권한을 부여했습니다.",
    );
  }

  async function saveName(member: UnifiedMember) {
    const name = draftName.trim();
    await run(member.uid, async () => {
      const updates: Promise<void>[] = [];
      if (member.admin) updates.push(updateRetreatAdminMemberName(member.uid, member.admin, name));
      if (member.iguard) updates.push(updateIguardMemberName(member.uid, member.iguard.email, name));
      await Promise.all(updates);
    }, "표시 이름을 저장했습니다.");
    setEditingUid(null);
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="통합 팀원 관리"
        tabIndex={-1}
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-100 bg-white/95 px-5 py-4 backdrop-blur sm:px-6">
          <div>
            <p className="text-xs font-bold tracking-[0.14em] text-violet-600">PEOPLE & ACCESS</p>
            <h2 className="mt-1 text-xl font-bold text-slate-900">통합 팀원 관리</h2>
            <p className="mt-1 text-xs text-slate-500">한 계정의 행정·학기 권한과 이가드 현장 권한을 함께 관리합니다.</p>
          </div>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-xl text-slate-500 hover:bg-slate-200" aria-label="닫기">×</button>
        </header>

        <div className="space-y-6 p-5 sm:p-6">
          {loadError && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">⚠ {loadError}</div>}

          <section className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-sky-50 p-4"><p className="text-xs font-semibold text-sky-600">행정·학기</p><p className="mt-1 text-2xl font-bold text-slate-900">{Object.keys(admins).length}명</p></div>
            <div className="rounded-xl bg-violet-50 p-4"><p className="text-xs font-semibold text-violet-600">이가드 전용</p><p className="mt-1 text-2xl font-bold text-slate-900">{Object.keys(iguardMembers).length}명</p></div>
            <div className="rounded-xl bg-amber-50 p-4"><p className="text-xs font-semibold text-amber-600">승인 대기</p><p className="mt-1 text-2xl font-bold text-slate-900">{pending.length}명</p></div>
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-bold text-slate-800">승인 대기</h3>
              <span className="text-xs text-slate-400">요청한 영역별로 승인합니다.</span>
            </div>
            {pending.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 py-7 text-center text-sm text-slate-400">대기 중인 요청이 없습니다.</div>
            ) : (
              <div className="space-y-2">
                {pending.map((request) => {
                  const info = request.admin ?? request.iguard;
                  return (
                    <div key={request.uid} className="rounded-xl border border-slate-200 p-3 sm:flex sm:items-center sm:justify-between sm:gap-4">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-800">{info?.name || "이름 없음"}</p>
                        <p className="truncate text-xs text-slate-400">{info?.email}</p>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 sm:mt-0 sm:justify-end">
                        {request.admin && <>
                          <button disabled={busyUid === request.uid} onClick={() => void run(request.uid, () => approveRetreatRequest(request.uid, request.admin!), "행정·학기 팀원으로 승인했습니다.")} className="rounded-lg bg-sky-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">행정·학기 승인</button>
                          <button disabled={busyUid === request.uid} onClick={() => void run(request.uid, () => denyRetreatRequest(request.uid), "행정 요청을 거절했습니다.")} className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-500 disabled:opacity-50">행정 거절</button>
                        </>}
                        {request.iguard && <>
                          <button disabled={busyUid === request.uid} onClick={() => void run(request.uid, () => approveIguardMember(request.uid, request.iguard!.email, "team", request.iguard!.name), "이가드팀으로 승인했습니다.")} className="rounded-lg bg-violet-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">이가드팀 승인</button>
                          <button disabled={busyUid === request.uid} onClick={() => void run(request.uid, () => approveIguardMember(request.uid, request.iguard!.email, "staff", request.iguard!.name), "현장 스탭으로 승인했습니다.")} className="rounded-lg bg-fuchsia-100 px-3 py-2 text-xs font-bold text-fuchsia-700 disabled:opacity-50">스탭 승인</button>
                          <button disabled={busyUid === request.uid} onClick={() => void run(request.uid, () => denyIguardPending(request.uid), "이가드 요청을 거절했습니다.")} className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-500 disabled:opacity-50">이가드 거절</button>
                        </>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section>
            <div className="mb-3">
              <h3 className="font-bold text-slate-800">승인된 팀원</h3>
              <p className="mt-1 text-xs text-slate-400">행정·학기 권한에는 이가드팀 전체 편집 권한이 포함됩니다.</p>
            </div>
            <div className="space-y-2">
              {members.map((member) => {
                const effectiveIguardRole = member.admin ? "team" : member.iguard ? (member.role ?? "team") : "none";
                const isMe = member.email === user?.email;
                return (
                  <div key={member.uid} className="rounded-xl border border-slate-200 p-3 sm:flex sm:items-center sm:gap-4">
                    <div className="min-w-0 flex-1">
                      {editingUid === member.uid ? (
                        <div className="flex gap-2">
                          <input className="input min-w-0 flex-1 text-sm" value={draftName} onChange={(event) => setDraftName(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void saveName(member)} autoFocus />
                          <button onClick={() => void saveName(member)} className="rounded-lg bg-slate-900 px-3 text-xs font-bold text-white">저장</button>
                          <button onClick={() => setEditingUid(null)} className="rounded-lg border border-slate-200 px-3 text-xs text-slate-500">취소</button>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-2"><p className="truncate font-semibold text-slate-800">{memberLabel(member)}</p>{isMe && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">나</span>}<button onClick={() => { setEditingUid(member.uid); setDraftName(member.name); }} className="text-[11px] text-slate-400 underline">이름 수정</button></div>
                          <p className="truncate text-xs text-slate-400">{member.email}</p>
                        </>
                      )}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2 sm:mt-0">
                      <button disabled={busyUid === member.uid || isMe} onClick={() => void toggleAdmin(member)} className={`rounded-lg border px-3 py-2 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-45 ${member.admin ? "border-sky-200 bg-sky-50 text-sky-700" : "border-slate-200 text-slate-500"}`}>{member.admin ? "✓ 행정·학기" : "+ 행정·학기"}</button>
                      {member.admin ? (
                        <span className="rounded-lg bg-violet-50 px-3 py-2 text-xs font-bold text-violet-700">✓ 이가드팀 포함</span>
                      ) : (
                        <div className="flex rounded-lg bg-slate-100 p-1">
                          {(["none", "staff", "team"] as const).map((role) => (
                            <button key={role} disabled={busyUid === member.uid || isMe} onClick={() => void changeIguardRole(member, role)} className={`rounded-md px-2.5 py-1.5 text-[11px] font-bold disabled:cursor-not-allowed disabled:opacity-45 ${effectiveIguardRole === role ? "bg-white text-violet-700 shadow-sm" : "text-slate-400"}`}>{role === "none" ? "없음" : role === "staff" ? "스탭" : "이가드팀"}</button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
