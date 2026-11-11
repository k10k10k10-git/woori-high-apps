"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { AuthIdentityError, onAuthStateChanged, retryAuthIdentity, signInWithGoogle, signOut as authSignOut, type User } from "@/lib/supabaseAuth";
import { get, ref } from "@/lib/rtdb";
import { auth, db } from "@/lib/firebase";
import { paths } from "@/lib/paths";
import { NO_ROLES, resolveMinistryRoles, type MinistryRoles } from "@/features/portal/accessPolicy";
import { mergeTeamMemberships, type TeamMemberships } from "@/features/teams/teamModel";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  roleError: boolean;
  /** 두 축 역할(학기·방학) — 화면 게이트는 accessPolicy의 판정 함수를 통해서만 쓴다 */
  roles: MinistryRoles;
  teamMemberships: TeamMemberships;
  /** 원시 역할 원장의 학적·출석 전체 조회 권한. 비활성 팀 연결도 Rules처럼 계산한다. */
  canSearchOfficialRoster: boolean;
  memberName: string | null;
  /** Google 로그인(켜졌을 때만). 이메일 로그인은 LoginButton 의 로그인 창이 맡는다. */
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  retryRoles: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function canReadAsMainAdmin(uid: string): Promise<boolean> {
  try {
    const snap = await get(ref(db, paths.admins(uid)));
    return snap.val() === true;
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
    const message = error instanceof Error ? error.message : String(error);
    if (/permission[\s_-]+denied/i.test(`${code} ${message}`)) return false;
    throw error;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<MinistryRoles>(NO_ROLES);
  const [teamMemberships, setTeamMemberships] = useState<TeamMemberships>({});
  const [canSearchOfficialRoster, setCanSearchOfficialRoster] = useState(false);
  const [memberName, setMemberName] = useState<string | null>(null);
  const [roleError, setRoleError] = useState(false);
  const authRequest = useRef(0);
  // 로그인은 됐지만 규칙용 uid(whoami)를 확인하지 못한 상태. "다시 시도"가 신원부터 다시 묻는다.
  const identityPending = useRef(false);

  const loadRoles = useCallback(async (u: User | null) => {
      const request = ++authRequest.current;
      identityPending.current = false;
      setUser(u);
      setLoading(true);
      setRoleError(false);
      setRoles(NO_ROLES);
      setTeamMemberships({});
      setCanSearchOfficialRoster(false);
      setMemberName(null);
      if (u) {
        try {
          const [retreatAdminSnap, iguardMemberSnap, iguardRoleSnap, isMainAdmin] = await Promise.all([
            get(ref(db, paths.retreatAdmin(u.uid))),
            get(ref(db, paths.iguardMember(u.uid))),
            get(ref(db, paths.iguardRole(u.uid))),
            canReadAsMainAdmin(u.uid),
          ]);
          // 로그아웃·계정 전환 뒤 늦게 도착한 이전 조회가 현재 역할을 덮지 않게 한다.
          if (request !== authRequest.current) return;
          const retreatAdmin = retreatAdminSnap.val();
          const iguardMember = iguardMemberSnap.val();

          const nameSource = [retreatAdmin, iguardMember].find(
            (value) => value && typeof value === "object" && typeof value.name === "string",
          );
          if (nameSource) setMemberName(nameSource.name.trim() || null);

          // 두 축 역할은 그 사람이 속한 노드(retreatAdmins 또는 iguardMembers) 아래에 있다.
          const roleSource = (retreatAdmin && typeof retreatAdmin === "object" ? retreatAdmin : null)
            ?? (iguardMember && typeof iguardMember === "object" ? iguardMember : null);

          const nextRoles = resolveMinistryRoles({
            isMainAdmin,
            hasRetreatAdmin: retreatAdmin != null,
            retreatAdminRole: retreatAdmin && typeof retreatAdmin === "object" ? retreatAdmin.role : undefined,
            hasIguardMember: iguardMember != null,
            iguardRole: iguardRoleSnap.val(),
            semesterRole: roleSource?.semesterRole,
            retreatRole: roleSource?.retreatRole,
          });
          setRoles(nextRoles);
          setCanSearchOfficialRoster(
            nextRoles.semester === "superAdmin" || nextRoles.semester === "pastor" || nextRoles.semester === "adminTeam"
            || (nextRoles.semester === "leader" && retreatAdmin != null && !retreatAdmin.teamMemberships),
          );
          // 같은 사람이 두 운영 계정 목록에 함께 있을 수 있다. 한쪽만 고르면 다른 쪽에
          // 연결된 팀이 사라져 보이므로 두 목록의 팀 연결을 합쳐 읽는다.
          setTeamMemberships(mergeTeamMemberships(
            iguardMember?.teamMemberships,
            retreatAdmin?.teamMemberships,
          ));
        } catch {
          if (request !== authRequest.current) return;
          setRoles(NO_ROLES);
          setTeamMemberships({});
          setCanSearchOfficialRoster(false);
          setMemberName(null);
          setRoleError(true);
        }
      }
      if (request !== authRequest.current) return;
      setLoading(false);
  }, []);

  const identityFailed = useCallback((error: Error) => {
    authRequest.current += 1;
    identityPending.current = true;
    // 로그인 화면으로 튀지 않게 확인 대기 계정을 두고 "권한 확인 실패 + 다시 시도"를 보인다.
    // 이 계정은 토큰을 내주지 않고 auth.currentUser 도 비어 있어 저장에 쓰이지 않는다.
    setUser(error instanceof AuthIdentityError ? error.pendingUser : null);
    setRoles(NO_ROLES);
    setTeamMemberships({});
    setCanSearchOfficialRoster(false);
    setMemberName(null);
    setRoleError(true);
    setLoading(false);
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, loadRoles, identityFailed);
    return () => {
      authRequest.current += 1;
      unsub();
    };
  }, [loadRoles, identityFailed]);

  function retryRoles() {
    if (identityPending.current) {
      identityPending.current = false;
      if (retryAuthIdentity()) {
        setRoleError(false);
        setLoading(true);
      } else {
        void loadRoles(null);
      }
      return;
    }
    if (user) void loadRoles(user);
  }

  async function signIn() {
    await signInWithGoogle();
  }

  async function signOut() {
    await authSignOut(auth);
    setRoles(NO_ROLES);
    setTeamMemberships({});
    setCanSearchOfficialRoster(false);
    setMemberName(null);
    setRoleError(false);
  }

  return (
    <AuthContext.Provider value={{ user, loading, roleError, roles, teamMemberships, canSearchOfficialRoster, memberName, signIn, signOut, retryRoles }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
