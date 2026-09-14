"use client";

// 팀원 관리 — 두 축 역할(학기·방학)을 한 화면에서 배정한다. 진입점은 전역 헤더의 "팀원 관리" 하나뿐.
// 역할 계약은 accessPolicy, 쓰기 계획은 roleAssign(순수) → applyRole(실행)이 담당한다.

import { useEffect, useMemo, useState } from "react";
import { X } from "@phosphor-icons/react";
import { useAuth } from "@/context/AuthContext";
import { useUI } from "@/context/UIContext";
import {
  denyRetreatRequest,
  subscribeToMainAdmins,
  subscribeToPendingRequests,
  subscribeToRetreatAdmins,
  updateRetreatAdminMemberName,
  updateRetreatAdminTeamMemberships,
  type RetreatAdminMember,
} from "@/lib/db";
import {
  denyIguardPending,
  subscribeToIguardMembers,
  subscribeToIguardPending,
  subscribeToIguardRoles,
  updateIguardMemberName,
  updateIguardTeamMemberships,
  type IguardMemberInfo,
  type IguardPendingReq,
  type IguardRole,
} from "@/features/iguard/lib/db";
import {
  ASSIGNABLE_RETREAT_ROLES,
  ASSIGNABLE_SEMESTER_ROLES,
  canManageRolesOf,
  hasAnyMinistryRole,
  isRetreatDowngrade,
  isRetreatUpgrade,
  isSemesterDowngrade,
  isSemesterUpgrade,
  NO_ROLES,
  resolveMinistryRoles,
  roleBadgeLabel,
  RETREAT_ROLE_HINTS,
  RETREAT_ROLE_LABELS,
  SEMESTER_ROLE_HINTS,
  SEMESTER_ROLE_LABELS,
  type MinistryRoles,
  type RetreatRole,
  type SemesterRole,
} from "./accessPolicy";
import { desiredStateFor, planRoleAssignment } from "./roleAssign";
import { applyRoleSteps } from "./applyRole";
import OverlayShell from "@/components/OverlayShell";
import { useLoadErrors } from "@/lib/useLoadErrors";
import { SUNDAY_MINISTRY_TEAMS, type SundayTeamKey } from "./featureCatalog";
import {
  TEAM_MEMBERSHIP_ROLE_LABELS,
  mergeTeamMemberships,
  type TeamMembershipRole,
  type TeamMemberships,
} from "@/features/teams/teamModel";

type TeamMember = {
  uid: string;
  email: string;
  name: string;
  roles: MinistryRoles;
  mainAdmin: boolean;
  admin?: RetreatAdminMember;
  iguard?: IguardMemberInfo;
  iguardRole?: IguardRole;
  teamMemberships: TeamMemberships;
};

const SEMESTER_CHIP: Record<SemesterRole, string> = {
  superAdmin: "bg-slate-900 text-white",
  pastor: "bg-emerald-100 text-emerald-800",
  leader: "bg-teal-100 text-teal-800",
  adminTeam: "bg-sky-100 text-sky-800",
  barnabas: "bg-rose-100 text-rose-800",
  worship: "bg-indigo-100 text-indigo-800",
  praise: "bg-purple-100 text-purple-800",
  media: "bg-cyan-100 text-cyan-800",
  design: "bg-lime-100 text-lime-800",
  staff: "bg-amber-100 text-amber-800",
  none: "bg-slate-100 text-slate-500",
};

const RETREAT_CHIP: Record<RetreatRole, string> = {
  superAdmin: "bg-slate-900 text-white",
  pastor: "bg-emerald-100 text-emerald-800",
  leader: "bg-teal-100 text-teal-800",
  adminTeam: "bg-sky-100 text-sky-800",
  iguardTeam: "bg-violet-100 text-violet-800",
  fieldStaff: "bg-amber-100 text-amber-800",
  none: "bg-slate-100 text-slate-500",
};

function memberLabel(member: { name: string; email: string }) {
  return member.name || member.email || "이름 미설정";
}

type TeamModalProps = { onClose?: () => void; embedded?: boolean };
type TeamSource = "mainAdmins" | "admins" | "adminPending" | "iguardMembers" | "iguardPending" | "iguardRoles";
const SOURCE_LABELS: Record<TeamSource, string> = {
  mainAdmins: "통합관리자", admins: "행정 팀원", adminPending: "사역 접근 신청",
  iguardMembers: "현장 팀원", iguardPending: "현장 접근 신청", iguardRoles: "현장 역할",
};

export default function TeamModal(props: TeamModalProps) {
  const { user, roles } = useAuth();
  const [revision, setRevision] = useState(0);
  return <TeamContent key={`${user?.uid ?? "anonymous"}:${roles.semester}:${roles.retreat}:${revision}`} {...props} onRetry={() => setRevision((value) => value + 1)} />;
}

function TeamContent({ onClose, embedded = false, onRetry }: TeamModalProps & { onRetry: () => void }) {
  const { user, roles: myRoles } = useAuth();
  const { toast, uiConfirm } = useUI();
  const canManage = canManageRolesOf(myRoles);

  const [mainAdmins, setMainAdmins] = useState<Record<string, boolean>>({});
  const [admins, setAdmins] = useState<Record<string, RetreatAdminMember>>({});
  const [adminPending, setAdminPending] = useState<Record<string, { email: string; name: string; requestedAt: number }>>({});
  const [iguardMembers, setIguardMembers] = useState<Record<string, IguardMemberInfo>>({});
  const [iguardPending, setIguardPending] = useState<IguardPendingReq[]>([]);
  const [iguardRoles, setIguardRoles] = useState<Record<string, IguardRole>>({});
  const [editingUid, setEditingUid] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [pendingRoleChoice, setPendingRoleChoice] = useState<Record<string, MinistryRoles>>({});
  const [pendingTeamChoice, setPendingTeamChoice] = useState<Record<string, SundayTeamKey[]>>({});
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<Partial<Record<TeamSource, "ready" | "error">>>({});
  const { fail, ok, message: loadError } = useLoadErrors("team-management");
  const [memberQuery, setMemberQuery] = useState("");

  useEffect(() => {
    let active = true;
    const receive = <T,>(key: TeamSource, setter: (value: T) => void) => (value: T) => {
      if (!active) return;
      setter(value);
      ok(SOURCE_LABELS[key]);
      setLoaded((current) => ({ ...current, [key]: "ready" }));
    };
    const reject = (key: TeamSource) => (error: Error) => {
      if (!active) return;
      fail(SOURCE_LABELS[key])(error);
      setLoaded((current) => ({ ...current, [key]: "error" }));
    };
    const unsubs = [
      subscribeToRetreatAdmins(receive("admins", setAdmins), reject("admins")),
      subscribeToPendingRequests(receive("adminPending", setAdminPending), reject("adminPending")),
      subscribeToIguardMembers(receive("iguardMembers", setIguardMembers), reject("iguardMembers")),
      subscribeToIguardPending(receive("iguardPending", setIguardPending), reject("iguardPending")),
      subscribeToIguardRoles(receive("iguardRoles", setIguardRoles), reject("iguardRoles")),
    ];
    if (canManage) unsubs.push(subscribeToMainAdmins(receive("mainAdmins", setMainAdmins), reject("mainAdmins")));
    return () => {
      active = false;
      unsubs.forEach((unsubscribe) => unsubscribe());
    };
  }, [canManage, fail, ok]);
  const requiredSources = (Object.keys(SOURCE_LABELS) as TeamSource[]).filter((key) => canManage || key !== "mainAdmins");
  const ready = requiredSources.every((key) => loaded[key] === "ready");

  const members = useMemo<TeamMember[]>(() => {
    const ids = new Set([...Object.keys(mainAdmins), ...Object.keys(admins), ...Object.keys(iguardMembers)]);
    return [...ids]
      .map((uid) => {
        const admin = admins[uid];
        const iguard = iguardMembers[uid];
        const mainAdmin = mainAdmins[uid] === true;
        const roleSource = admin ?? iguard;
        return {
          uid,
          admin,
          iguard,
          mainAdmin,
          iguardRole: iguardRoles[uid],
          email: admin?.email || iguard?.email || "",
          name: admin?.name || iguard?.name || "",
          roles: resolveMinistryRoles({
            isMainAdmin: mainAdmin,
            hasRetreatAdmin: admin != null,
            retreatAdminRole: admin?.role,
            hasIguardMember: iguard != null,
            iguardRole: iguardRoles[uid],
            semesterRole: roleSource?.semesterRole,
            retreatRole: roleSource?.retreatRole,
          }),
          teamMemberships: mergeTeamMemberships(
            iguard?.teamMemberships,
            admin?.teamMemberships,
          ),
        };
      })
      // 학기 역할군(높은 권한 → 낮은 권한)으로 먼저 묶고, 같은 역할 안에서만 이름순으로 정렬한다.
      .sort((a, b) => {
        const byRole = ASSIGNABLE_SEMESTER_ROLES.indexOf(a.roles.semester) - ASSIGNABLE_SEMESTER_ROLES.indexOf(b.roles.semester);
        return byRole !== 0 ? byRole : memberLabel(a).localeCompare(memberLabel(b), "ko");
      });
  }, [admins, iguardMembers, iguardRoles, mainAdmins]);

  const filteredMembers = useMemo(() => {
    const query = memberQuery.trim().toLocaleLowerCase("ko");
    if (!query) return members;
    return members.filter((member) => [
      member.name,
      member.email,
      SEMESTER_ROLE_LABELS[member.roles.semester],
      RETREAT_ROLE_LABELS[member.roles.retreat],
      ...Object.keys(member.teamMemberships).map((key) => SUNDAY_MINISTRY_TEAMS.find((team) => team.key === key)?.label ?? key),
    ].some((value) => value.toLocaleLowerCase("ko").includes(query)));
  }, [memberQuery, members]);

  const memberGroups = useMemo(
    () => ASSIGNABLE_SEMESTER_ROLES
      .map((role) => ({ role, list: filteredMembers.filter((member) => member.roles.semester === role) }))
      .filter((group) => group.list.length > 0),
    [filteredMembers],
  );

  const semesterCounts = useMemo(() => {
    const counts = new Map<SemesterRole, number>();
    for (const member of members) counts.set(member.roles.semester, (counts.get(member.roles.semester) ?? 0) + 1);
    return counts;
  }, [members]);

  const retreatCounts = useMemo(() => {
    const counts = new Map<RetreatRole, number>();
    for (const member of members) counts.set(member.roles.retreat, (counts.get(member.roles.retreat) ?? 0) + 1);
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
      toast(success, "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), "error");
    } finally {
      setBusyUid(null);
    }
  }

  async function changeRoles(member: TeamMember, next: MinistryRoles) {
    if (next.semester === member.roles.semester && next.retreat === member.roles.retreat) return;
    const steps = planRoleAssignment(next, {
      mainAdmin: member.mainAdmin,
      hasRetreatAdmin: member.admin != null,
      retreatAdminRole: member.admin?.role,
      hasIguardMember: member.iguard != null,
      iguardRole: member.iguardRole,
      roles: member.roles,
    });
    if (steps.length === 0) return;

    const upgraded = isSemesterUpgrade(member.roles.semester, next.semester)
      || isRetreatUpgrade(member.roles.retreat, next.retreat);
    const downgraded = isSemesterDowngrade(member.roles.semester, next.semester)
      || isRetreatDowngrade(member.roles.retreat, next.retreat);
    if (upgraded) {
      const confirmed = await uiConfirm(
        `${memberLabel(member)}님의 권한을 높일까요?\n`
        + `학기 ${SEMESTER_ROLE_LABELS[member.roles.semester]} → ${SEMESTER_ROLE_LABELS[next.semester]}\n`
        + `방학 ${RETREAT_ROLE_LABELS[member.roles.retreat]} → ${RETREAT_ROLE_LABELS[next.retreat]}\n\n`
        + `높아진 역할에 따라 개인정보 조회·수정 범위가 넓어질 수 있습니다.`,
      );
      if (!confirmed) return;
    } else if (downgraded) {
      const confirmed = await uiConfirm(
        `${memberLabel(member)}님의 역할을 낮출까요?\n`
        + `학기 ${SEMESTER_ROLE_LABELS[member.roles.semester]} → ${SEMESTER_ROLE_LABELS[next.semester]}\n`
        + `방학 ${RETREAT_ROLE_LABELS[member.roles.retreat]} → ${RETREAT_ROLE_LABELS[next.retreat]}`,
      );
      if (!confirmed) return;
    }
    await run(
      member.uid,
      async () => {
        await applyRoleSteps(steps, {
        uid: member.uid,
        email: member.email,
        name: member.name,
        hasIguardMember: member.iguard != null,
        });
        const desired = desiredStateFor(next);
        if (desired.retreatAdmin) await updateRetreatAdminTeamMemberships(member.uid, member.teamMemberships);
        if (desired.iguard) await updateIguardTeamMemberships(member.uid, member.teamMemberships);
      },
      `${memberLabel(member)} → 학기 ${SEMESTER_ROLE_LABELS[next.semester]} · 방학 ${RETREAT_ROLE_LABELS[next.retreat]}`,
    );
  }

  async function changeTeamMembership(member: TeamMember, teamKey: SundayTeamKey, role: TeamMembershipRole | null) {
    const next: TeamMemberships = { ...member.teamMemberships };
    if (role) next[teamKey] = { role, active: true };
    else delete next[teamKey];
    await run(member.uid, async () => {
      const writes: Promise<void>[] = [];
      if (member.admin) writes.push(updateRetreatAdminTeamMemberships(member.uid, next));
      if (member.iguard) writes.push(updateIguardTeamMemberships(member.uid, next));
      await Promise.all(writes);
    }, role
      ? `${memberLabel(member)} → ${SUNDAY_MINISTRY_TEAMS.find((team) => team.key === teamKey)?.label} ${TEAM_MEMBERSHIP_ROLE_LABELS[role]}`
      : `${memberLabel(member)}님의 담당 팀 연결을 해제했습니다.`);
  }

  /**
   * 팀원 삭제 — 세 노드(admins·retreatAdmins·iguardMembers+iguardRoles)의 권한을 모두 회수한다.
   * 구글 계정 자체는 지우지 않는다(그건 Firebase 콘솔의 몫). 다시 승인하면 복구된다.
   */
  async function removeMember(member: TeamMember) {
    const steps = planRoleAssignment(NO_ROLES, {
      mainAdmin: member.mainAdmin,
      hasRetreatAdmin: member.admin != null,
      retreatAdminRole: member.admin?.role,
      hasIguardMember: member.iguard != null,
      iguardRole: member.iguardRole,
      roles: member.roles,
    });
    if (steps.length === 0) return;
    const confirmed = await uiConfirm(
      `${memberLabel(member)}님을 팀원에서 삭제할까요?\n`
      + `현재 역할: ${roleBadgeLabel(member.roles)}\n\n`
      + `모든 접근 권한이 회수되어 로그인해도 화면에 들어오지 못합니다.\n`
      + `구글 계정 자체는 삭제되지 않으며, 다시 승인하면 복구됩니다.`,
    );
    if (!confirmed) return;
    await run(
      member.uid,
      () => applyRoleSteps(steps, {
        uid: member.uid,
        email: member.email,
        name: member.name,
        hasIguardMember: member.iguard != null,
      }),
      `${memberLabel(member)} 팀원 삭제`,
    );
  }

  async function approvePending(request: (typeof pending)[number]) {
    const info = request.admin ?? request.iguard;
    if (!info) return;
    const choice = pendingRoleChoice[request.uid] ?? NO_ROLES;
    if (!hasAnyMinistryRole(choice)) {
      toast("학기 또는 방학 역할을 하나 이상 선택해 주세요.", "error");
      return;
    }
    const selectedTeams = pendingTeamChoice[request.uid] ?? [];
    const needsTeam = ["leader", "adminTeam", "barnabas", "worship", "praise", "media", "design", "staff"].includes(choice.semester);
    if (needsTeam && selectedTeams.length === 0) {
      toast("담당 팀을 하나 이상 선택해 주세요.", "error");
      return;
    }
    const steps = planRoleAssignment(choice, {
      mainAdmin: false,
      hasRetreatAdmin: false,
      hasIguardMember: false,
    });
    await run(request.uid, async () => {
      await applyRoleSteps(steps, { uid: request.uid, email: info.email, name: info.name, hasIguardMember: false });
      const memberships = Object.fromEntries(selectedTeams.map((teamKey) => [teamKey, {
        role: choice.semester === "leader" ? "leader" : "staff",
        active: true,
      }])) as TeamMemberships;
      const desired = desiredStateFor(choice);
      if (desired.retreatAdmin) await updateRetreatAdminTeamMemberships(request.uid, memberships);
      if (desired.iguard) await updateIguardTeamMemberships(request.uid, memberships);
      if (request.admin) await denyRetreatRequest(request.uid);
      if (request.iguard) await denyIguardPending(request.uid);
    }, `${info.name || info.email} → 학기 ${SEMESTER_ROLE_LABELS[choice.semester]} · 방학 ${RETREAT_ROLE_LABELS[choice.retreat]} 승인`);
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

  const content = (
    <>
        {!embedded && <header className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-100 bg-white/95 px-5 py-4 backdrop-blur sm:px-6">
          <div>
            <h2 className="text-xl font-bold text-slate-900">팀원 관리</h2>
            <p className="mt-1 text-xs text-slate-500">학기 역할은 학기·주일 화면에, 방학 역할은 수련회 행정·현장 화면에 적용됩니다.</p>
          </div>
          <button onClick={onClose} className="compact-icon-control rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200" aria-label="닫기"><X aria-hidden="true" size={18} weight="bold" /></button>
        </header>}

        <div className="space-y-6 p-5 sm:p-6">
          {loadError && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <p>팀원 정보를 확인하지 못했습니다: {loadError}</p>
            <p className="mt-1">모든 역할 정보를 확인한 뒤 팀원 관리가 열립니다.</p>
            <button type="button" onClick={onRetry} className="btn-secondary mt-3">다시 불러오기</button>
          </div>}
          {!ready && !loadError && <div role="status" className="grid min-h-44 place-items-center text-sm text-slate-500">팀원과 역할 정보를 불러오는 중…</div>}
          {!canManage && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              역할 배정은 통합관리자만 할 수 있습니다. 지금은 조회만 가능합니다.
            </div>
          )}

          {ready && <>
          <details className="rounded-xl border border-slate-200 px-4">
            <summary className="cursor-pointer py-3 text-sm font-semibold text-slate-800">역할 안내 <span className="ml-2 text-xs font-normal text-slate-500">학기·방학 역할별 권한과 인원</span></summary>
            <div className="space-y-5 pb-4">
          <section>
            <h3 className="mb-2 font-bold text-slate-800">학기 역할 <span className="text-xs font-normal text-slate-400">학기 운영 · 팀/주일 운영</span></h3>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {ASSIGNABLE_SEMESTER_ROLES.filter((role) => role !== "none").map((role) => (
                <div key={role} className="flex items-center gap-2 rounded-xl border border-slate-100 px-3 py-2">
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold leading-none ${SEMESTER_CHIP[role]}`}>{SEMESTER_ROLE_LABELS[role]}</span>
                  <span className="text-[11px] leading-snug text-slate-500">{SEMESTER_ROLE_HINTS[role]}</span>
                  <span className="ml-auto shrink-0 text-xs font-bold text-slate-400">{semesterCounts.get(role) ?? 0}명</span>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-2 font-bold text-slate-800">방학 역할 <span className="text-xs font-normal text-slate-400">수련회 행정 · 현장</span></h3>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {ASSIGNABLE_RETREAT_ROLES.filter((role) => role !== "none").map((role) => (
                <div key={role} className="flex items-center gap-2 rounded-xl border border-slate-100 px-3 py-2">
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold leading-none ${RETREAT_CHIP[role]}`}>{RETREAT_ROLE_LABELS[role]}</span>
                  <span className="text-[11px] leading-snug text-slate-500">{RETREAT_ROLE_HINTS[role]}</span>
                  <span className="ml-auto shrink-0 text-xs font-bold text-slate-400">{retreatCounts.get(role) ?? 0}명</span>
                </div>
              ))}
            </div>
          </section>

            </div>
          </details>

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
                  const choice = pendingRoleChoice[request.uid] ?? NO_ROLES;
                  const setChoice = (next: Partial<MinistryRoles>) =>
                    setPendingRoleChoice((current) => ({ ...current, [request.uid]: { ...choice, ...next } }));
                  return (
                    <div key={request.uid} className="rounded-xl border border-slate-200 p-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-800">{info?.name || "이름 없음"}</p>
                        <p className="truncate text-xs text-slate-400">{info?.email}</p>
                      </div>
                      <div className="mt-3 flex flex-wrap items-end gap-2">
                        <label className="min-w-0 flex-1 text-[11px] font-semibold text-slate-500">
                          학기 역할
                          <select
                            className="input text-xs"
                            value={choice.semester}
                            disabled={!canManage || busyUid === request.uid}
                            onChange={(event) => setChoice({ semester: event.target.value as SemesterRole })}
                          >
                            {ASSIGNABLE_SEMESTER_ROLES.filter((role) => role !== "superAdmin").map((role) => (
                              <option key={role} value={role}>{SEMESTER_ROLE_LABELS[role]}</option>
                            ))}
                          </select>
                        </label>
                        <fieldset className="w-full">
                          <legend className="mb-1 text-[11px] font-semibold text-slate-500">담당 팀</legend>
                          <div className="flex flex-wrap gap-1.5">
                            {SUNDAY_MINISTRY_TEAMS.map((team) => {
                              const checked = (pendingTeamChoice[request.uid] ?? []).includes(team.key);
                              return <label key={team.key} className="team-membership-choice"><input type="checkbox" checked={checked} disabled={!canManage || busyUid === request.uid} onChange={() => setPendingTeamChoice((current) => ({ ...current, [request.uid]: checked ? (current[request.uid] ?? []).filter((key) => key !== team.key) : [...(current[request.uid] ?? []), team.key] }))} />{team.label}</label>;
                            })}
                          </div>
                        </fieldset>
                        <label className="min-w-0 flex-1 text-[11px] font-semibold text-slate-500">
                          방학 역할
                          <select
                            className="input text-xs"
                            value={choice.retreat}
                            disabled={!canManage || busyUid === request.uid}
                            onChange={(event) => setChoice({ retreat: event.target.value as RetreatRole })}
                          >
                            {ASSIGNABLE_RETREAT_ROLES.filter((role) => role !== "superAdmin").map((role) => (
                              <option key={role} value={role}>{RETREAT_ROLE_LABELS[role]}</option>
                            ))}
                          </select>
                        </label>
                        <button
                          disabled={!canManage || busyUid === request.uid || !hasAnyMinistryRole(choice)}
                          title={hasAnyMinistryRole(choice) ? undefined : "학기 또는 방학 역할을 먼저 선택해 주세요."}
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
            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h3 className="font-bold text-slate-800">승인된 팀원</h3>
                <p className="mt-1 text-xs text-slate-400">학기 역할군 순으로 묶어 보여줍니다. 역할을 바꾸면 이전 권한은 자동으로 정리됩니다.</p>
              </div>
              <label className="team-member-search">
                <span className="sr-only">팀원 검색</span>
                <input
                  value={memberQuery}
                  onChange={(event) => setMemberQuery(event.target.value)}
                  placeholder="이름, 이메일, 역할 검색"
                  className="input"
                />
              </label>
            </div>
            <div className="space-y-5">
              {filteredMembers.length === 0 && (
                <div className="rounded-xl border border-dashed border-slate-200 py-7 text-center text-sm text-slate-400">{members.length === 0 ? "승인된 팀원이 없습니다." : "검색 결과가 없습니다."}</div>
              )}
              {memberGroups.map((group) => (
                <div key={group.role} className="space-y-2">
                  <div className="flex items-center gap-2 border-b border-slate-100 pb-1.5">
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold leading-none ${SEMESTER_CHIP[group.role]}`}>{SEMESTER_ROLE_LABELS[group.role]}</span>
                    <span className="text-xs font-semibold text-slate-400">{group.list.length}명</span>
                  </div>
                  {group.list.map((member) => {
                    const isMe = member.uid === user?.uid;
                    return (
                      <div key={member.uid} className="team-member-card rounded-xl border border-slate-200 p-3">
                        <div className="min-w-0">
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
                                <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-bold leading-none ${member.roles.semester === "none" ? RETREAT_CHIP[member.roles.retreat] : SEMESTER_CHIP[member.roles.semester]}`}>
                                  {roleBadgeLabel(member.roles)}
                                </span>
                                {(member.admin || member.iguard) && (
                                  <button onClick={() => { setEditingUid(member.uid); setDraftName(member.name); }} className="text-[11px] text-slate-400 underline">이름 수정</button>
                                )}
                                {canManage && !isMe && (
                                  <button
                                    onClick={() => void removeMember(member)}
                                    disabled={busyUid === member.uid}
                                    className="text-[11px] text-slate-400 underline hover:text-red-500 disabled:opacity-50"
                                  >
                                    팀원 삭제
                                  </button>
                                )}
                              </div>
                              {/* admins 노드에는 이메일이 없다 — 본인 계정이면 로그인 정보로 보완한다 */}
                              <p className="truncate text-xs text-slate-400">{member.email || (isMe ? user?.email ?? member.uid : member.uid)}</p>
                            </>
                          )}
                        </div>
                        <div className="team-member-roles mt-3 flex flex-wrap gap-2">
                          <label className="min-w-0 flex-1 text-[11px] font-semibold text-slate-500">
                            학기 역할
                            <select
                              className="input text-xs"
                              aria-label={`${memberLabel(member)} 학기 역할`}
                              value={member.roles.semester}
                              disabled={!canManage || isMe || busyUid === member.uid}
                              onChange={(event) => void changeRoles(member, { ...member.roles, semester: event.target.value as SemesterRole })}
                            >
                              {ASSIGNABLE_SEMESTER_ROLES.map((role) => (
                                <option key={role} value={role}>{SEMESTER_ROLE_LABELS[role]}</option>
                              ))}
                            </select>
                          </label>
                          <label className="min-w-0 flex-1 text-[11px] font-semibold text-slate-500">
                            방학 역할
                            <select
                              className="input text-xs"
                              aria-label={`${memberLabel(member)} 방학 역할`}
                              value={member.roles.retreat}
                              disabled={!canManage || isMe || busyUid === member.uid}
                              onChange={(event) => void changeRoles(member, { ...member.roles, retreat: event.target.value as RetreatRole })}
                            >
                              {ASSIGNABLE_RETREAT_ROLES.map((role) => (
                                <option key={role} value={role}>{RETREAT_ROLE_LABELS[role]}</option>
                              ))}
                            </select>
                          </label>
                        </div>
                        <fieldset className="mt-3 border-t border-slate-100 pt-3">
                          <legend className="mb-2 text-[11px] font-semibold text-slate-500">담당 팀과 팀 내 역할</legend>
                          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                            {SUNDAY_MINISTRY_TEAMS.map((team) => {
                              const membership = member.teamMemberships[team.key];
                              return <label key={team.key} className="team-membership-editor">
                                <span>{team.label}</span>
                                <select aria-label={`${memberLabel(member)} ${team.label} 담당`} value={membership?.role ?? ""} disabled={!canManage || isMe || busyUid === member.uid || member.mainAdmin} onChange={(event) => void changeTeamMembership(member, team.key, (event.target.value || null) as TeamMembershipRole | null)}>
                                  <option value="">미연결</option>
                                  {Object.entries(TEAM_MEMBERSHIP_ROLE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                                </select>
                              </label>;
                            })}
                          </div>
                        </fieldset>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </section>
          </>}
        </div>
    </>
  );

  if (embedded) return <div className="rounded-2xl border border-slate-200 bg-white">{content}</div>;
  return (
    <OverlayShell
      label="팀원 관리"
      onClose={onClose ?? (() => undefined)}
      variant="fullscreen-mobile"
      panelClassName="max-h-[90dvh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl"
    >
        {content}
    </OverlayShell>
  );
}
