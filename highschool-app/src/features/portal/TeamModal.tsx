"use client";

// 팀원 관리 — 6단계 역할을 한 화면에서 배정한다. 진입점은 전역 헤더의 "팀원 관리" 하나뿐.
// 역할 계약은 accessPolicy, 쓰기 계획은 roleAssign(순수) → applyRole(실행)이 담당한다.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useUI } from "@/context/UIContext";
import {
  denyRetreatRequest,
  getMainAdmins,
  getPendingRequests,
  getRetreatAdmins,
  updateRetreatAdminMemberName,
  type RetreatAdminMember,
} from "@/lib/db";
import {
  denyIguardPending,
  subscribeToIguardMembers,
  subscribeToIguardPending,
  subscribeToIguardRoles,
  updateIguardMemberName,
  type IguardMemberInfo,
  type IguardPendingReq,
  type IguardRole,
} from "@/features/iguard/lib/db";
import {
  ASSIGNABLE_ROLES,
  canManageRoles,
  MINISTRY_ROLE_HINTS,
  MINISTRY_ROLE_LABELS,
  resolveMinistryRole,
  type MinistryRole,
} from "./accessPolicy";
import { isDowngrade, planRoleAssignment } from "./roleAssign";
import { applyRoleSteps } from "./applyRole";

type TeamMember = {
  uid: string;
  email: string;
  name: string;
  role: MinistryRole;
  mainAdmin: boolean;
  admin?: RetreatAdminMember;
  iguard?: IguardMemberInfo;
  iguardRole?: IguardRole;
};

const ROLE_CHIP: Record<MinistryRole, string> = {
  superAdmin: "bg-slate-900 text-white",
  pastor: "bg-emerald-100 text-emerald-800",
  leader: "bg-teal-100 text-teal-800",
  adminTeam: "bg-sky-100 text-sky-800",
  iguardTeam: "bg-violet-100 text-violet-800",
  staff: "bg-amber-100 text-amber-800",
  none: "bg-slate-100 text-slate-500",
};

function memberLabel(member: { name: string; email: string }) {
  return member.name || member.email || "이름 미설정";
}

export default function TeamModal({ onClose }: { onClose: () => void }) {
  const { user, role: myRole } = useAuth();
  const { toast, uiConfirm } = useUI();
  const dialogRef = useRef<HTMLDivElement>(null);
  const canManage = canManageRoles(myRole);

  const [mainAdmins, setMainAdmins] = useState<Record<string, boolean>>({});
  const [admins, setAdmins] = useState<Record<string, RetreatAdminMember>>({});
  const [adminPending, setAdminPending] = useState<Record<string, { email: string; name: string; requestedAt: number }>>({});
  const [iguardMembers, setIguardMembers] = useState<Record<string, IguardMemberInfo>>({});
  const [iguardPending, setIguardPending] = useState<IguardPendingReq[]>([]);
  const [iguardRoles, setIguardRoles] = useState<Record<string, IguardRole>>({});
  const [editingUid, setEditingUid] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [pendingRoleChoice, setPendingRoleChoice] = useState<Record<string, MinistryRole>>({});
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadDirectAccess = useCallback(async () => {
    try {
      const [nextAdmins, nextPending] = await Promise.all([getRetreatAdmins(), getPendingRequests()]);
      setAdmins(nextAdmins);
      setAdminPending(nextPending);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error));
    }
    if (!canManage) return;
    try {
      setMainAdmins(await getMainAdmins());
    } catch (error) {
      // admins 노드는 통합관리자만 읽는다 — 실패해도 나머지 화면은 사용 가능해야 한다.
      setLoadError((current) => current ?? (error instanceof Error ? error.message : String(error)));
    }
  }, [canManage]);

  useEffect(() => {
    void loadDirectAccess();
    const fail = (error: Error) => setLoadError((current) => current ?? error.message);
    const unsubs = [
      subscribeToIguardMembers(setIguardMembers, fail),
      subscribeToIguardPending(setIguardPending, fail),
      subscribeToIguardRoles(setIguardRoles, fail),
    ];
    return () => unsubs.forEach((unsubscribe) => unsubscribe());
  }, [loadDirectAccess]);

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

  const members = useMemo<TeamMember[]>(() => {
    const ids = new Set([...Object.keys(mainAdmins), ...Object.keys(admins), ...Object.keys(iguardMembers)]);
    return [...ids]
      .map((uid) => {
        const admin = admins[uid];
        const iguard = iguardMembers[uid];
        const mainAdmin = mainAdmins[uid] === true;
        return {
          uid,
          admin,
          iguard,
          mainAdmin,
          iguardRole: iguardRoles[uid],
          email: admin?.email || iguard?.email || "",
          name: admin?.name || iguard?.name || "",
          role: resolveMinistryRole({
            isMainAdmin: mainAdmin,
            hasRetreatAdmin: admin != null,
            retreatAdminRole: admin?.role,
            hasIguardMember: iguard != null,
            iguardRole: iguardRoles[uid],
          }),
        };
      })
      .sort((a, b) => memberLabel(a).localeCompare(memberLabel(b), "ko"));
  }, [admins, iguardMembers, iguardRoles, mainAdmins]);

  const roleCounts = useMemo(() => {
    const counts = new Map<MinistryRole, number>();
    for (const member of members) counts.set(member.role, (counts.get(member.role) ?? 0) + 1);
    return counts;
  }, [members]);

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
      await loadDirectAccess();
      toast(success, "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), "error");
    } finally {
      setBusyUid(null);
    }
  }

  async function changeRole(member: TeamMember, nextRole: MinistryRole) {
    if (nextRole === member.role) return;
    const steps = planRoleAssignment(nextRole, {
      mainAdmin: member.mainAdmin,
      hasRetreatAdmin: member.admin != null,
      retreatAdminRole: member.admin?.role,
      hasIguardMember: member.iguard != null,
      iguardRole: member.iguardRole,
    });
    if (steps.length === 0) return;
    if (isDowngrade(member.role, nextRole)) {
      const confirmed = await uiConfirm(
        `${memberLabel(member)}님의 역할을 ${MINISTRY_ROLE_LABELS[member.role]} → ${MINISTRY_ROLE_LABELS[nextRole]}(으)로 낮출까요?`,
      );
      if (!confirmed) return;
    }
    await run(
      member.uid,
      () => applyRoleSteps(steps, {
        uid: member.uid,
        email: member.email,
        name: member.name,
        hasIguardMember: member.iguard != null,
      }),
      `${memberLabel(member)} → ${MINISTRY_ROLE_LABELS[nextRole]}`,
    );
  }

  async function approvePending(request: (typeof pending)[number]) {
    const info = request.admin ?? request.iguard;
    if (!info) return;
    const nextRole = pendingRoleChoice[request.uid] ?? "staff";
    if (nextRole === "none") {
      await run(request.uid, async () => {
        if (request.admin) await denyRetreatRequest(request.uid);
        if (request.iguard) await denyIguardPending(request.uid);
      }, "요청을 거절했습니다.");
      return;
    }
    const steps = planRoleAssignment(nextRole, {
      mainAdmin: false,
      hasRetreatAdmin: false,
      hasIguardMember: false,
    });
    await run(request.uid, async () => {
      await applyRoleSteps(steps, { uid: request.uid, email: info.email, name: info.name, hasIguardMember: false });
      if (request.admin) await denyRetreatRequest(request.uid);
      if (request.iguard) await denyIguardPending(request.uid);
    }, `${info.name || info.email} → ${MINISTRY_ROLE_LABELS[nextRole]} 승인`);
  }

  async function saveName(member: TeamMember) {
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
        aria-label="팀원 관리"
        tabIndex={-1}
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-100 bg-white/95 px-5 py-4 backdrop-blur sm:px-6">
          <div>
            <p className="text-xs font-bold tracking-[0.14em] text-emerald-600">PEOPLE &amp; ACCESS</p>
            <h2 className="mt-1 text-xl font-bold text-slate-900">팀원 관리</h2>
            <p className="mt-1 text-xs text-slate-500">역할 하나로 학기·행정·현장 권한이 함께 정해집니다.</p>
          </div>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-xl text-slate-500 hover:bg-slate-200" aria-label="닫기">×</button>
        </header>

        <div className="space-y-6 p-5 sm:p-6">
          {loadError && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">⚠ {loadError}</div>}
          {!canManage && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              역할 배정은 통합관리자만 할 수 있습니다. 지금은 조회만 가능합니다.
            </div>
          )}

          <section>
            <h3 className="mb-2 font-bold text-slate-800">역할 정의</h3>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {ASSIGNABLE_ROLES.filter((role) => role !== "none").map((role) => (
                <div key={role} className="flex items-center gap-2 rounded-xl border border-slate-100 px-3 py-2">
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold leading-none ${ROLE_CHIP[role]}`}>{MINISTRY_ROLE_LABELS[role]}</span>
                  <span className="text-[11px] leading-snug text-slate-500">{MINISTRY_ROLE_HINTS[role]}</span>
                  <span className="ml-auto shrink-0 text-xs font-bold text-slate-400">{roleCounts.get(role) ?? 0}명</span>
                </div>
              ))}
            </div>
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-bold text-slate-800">승인 대기</h3>
              <span className="text-xs text-slate-400">역할을 고른 뒤 승인합니다.</span>
            </div>
            {pending.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 py-7 text-center text-sm text-slate-400">대기 중인 요청이 없습니다.</div>
            ) : (
              <div className="space-y-2">
                {pending.map((request) => {
                  const info = request.admin ?? request.iguard;
                  const choice = pendingRoleChoice[request.uid] ?? "staff";
                  return (
                    <div key={request.uid} className="rounded-xl border border-slate-200 p-3 sm:flex sm:items-center sm:justify-between sm:gap-4">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-800">{info?.name || "이름 없음"}</p>
                        <p className="truncate text-xs text-slate-400">{info?.email}</p>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2 sm:mt-0 sm:justify-end">
                        <select
                          className="input text-xs sm:w-36"
                          aria-label={`${info?.name || info?.email} 승인 역할`}
                          value={choice}
                          disabled={!canManage || busyUid === request.uid}
                          onChange={(event) => setPendingRoleChoice((current) => ({ ...current, [request.uid]: event.target.value as MinistryRole }))}
                        >
                          {ASSIGNABLE_ROLES.filter((role) => role !== "none" && role !== "superAdmin").map((role) => (
                            <option key={role} value={role}>{MINISTRY_ROLE_LABELS[role]}</option>
                          ))}
                        </select>
                        <button
                          disabled={!canManage || busyUid === request.uid}
                          onClick={() => void approvePending(request)}
                          className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                        >
                          승인
                        </button>
                        <button
                          disabled={!canManage || busyUid === request.uid}
                          onClick={() => void run(request.uid, async () => {
                            if (request.admin) await denyRetreatRequest(request.uid);
                            if (request.iguard) await denyIguardPending(request.uid);
                          }, "요청을 거절했습니다.")}
                          className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-500 disabled:opacity-50"
                        >
                          거절
                        </button>
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
              <p className="mt-1 text-xs text-slate-400">역할을 바꾸면 이전 권한은 자동으로 정리됩니다.</p>
            </div>
            <div className="space-y-2">
              {members.length === 0 && (
                <div className="rounded-xl border border-dashed border-slate-200 py-7 text-center text-sm text-slate-400">승인된 팀원이 없습니다.</div>
              )}
              {members.map((member) => {
                const isMe = member.uid === user?.uid;
                return (
                  <div key={member.uid} className="rounded-xl border border-slate-200 p-3 sm:flex sm:items-center sm:gap-4">
                    <div className="min-w-0 flex-1">
                      {editingUid === member.uid ? (
                        <div className="flex gap-2">
                          <input className="input min-w-0 flex-1 text-sm" value={draftName} onChange={(event) => setDraftName(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void saveName(member)} autoFocus aria-label="표시 이름" />
                          <button onClick={() => void saveName(member)} className="rounded-lg bg-slate-900 px-3 text-xs font-bold text-white">저장</button>
                          <button onClick={() => setEditingUid(null)} className="rounded-lg border border-slate-200 px-3 text-xs text-slate-500">취소</button>
                        </div>
                      ) : (
                        <>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <p className="truncate font-semibold leading-6 text-slate-800">{memberLabel(member)}</p>
                            {isMe && <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[11px] leading-none text-slate-500">나</span>}
                            <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-bold leading-none ${ROLE_CHIP[member.role]}`}>{MINISTRY_ROLE_LABELS[member.role]}</span>
                            {(member.admin || member.iguard) && (
                              <button onClick={() => { setEditingUid(member.uid); setDraftName(member.name); }} className="text-[11px] text-slate-400 underline">이름 수정</button>
                            )}
                          </div>
                          {/* admins 노드에는 이메일이 없다 — 본인 계정이면 로그인 정보로 보완한다 */}
                          <p className="truncate text-xs text-slate-400">{member.email || (isMe ? user?.email ?? member.uid : member.uid)}</p>
                        </>
                      )}
                    </div>
                    <div className="mt-3 shrink-0 sm:mt-0 sm:w-40">
                      <select
                        className="input text-xs"
                        aria-label={`${memberLabel(member)} 역할`}
                        value={member.role}
                        disabled={!canManage || isMe || busyUid === member.uid}
                        onChange={(event) => void changeRole(member, event.target.value as MinistryRole)}
                      >
                        {ASSIGNABLE_ROLES.map((role) => (
                          <option key={role} value={role}>{MINISTRY_ROLE_LABELS[role]}</option>
                        ))}
                      </select>
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
