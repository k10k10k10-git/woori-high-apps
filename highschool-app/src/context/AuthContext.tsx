"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, onAuthStateChanged, signOut as firebaseSignOut, signInWithPopup } from "firebase/auth";
import { get, ref } from "firebase/database";
import { auth, googleProvider, db } from "@/lib/firebase";
import { paths } from "@/lib/paths";
import { NO_ROLES, resolveMinistryRoles, type MinistryRoles } from "@/features/portal/accessPolicy";
import { mergeTeamMemberships, type TeamMemberships } from "@/features/teams/teamModel";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  /** 두 축 역할(학기·방학) — 화면 게이트는 accessPolicy의 판정 함수를 통해서만 쓴다 */
  roles: MinistryRoles;
  teamMemberships: TeamMemberships;
  memberName: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function canReadAsMainAdmin(uid: string): Promise<boolean> {
  try {
    const snap = await get(ref(db, paths.admins(uid)));
    return snap.val() === true;
  } catch {
    return false;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<MinistryRoles>(NO_ROLES);
  const [teamMemberships, setTeamMemberships] = useState<TeamMemberships>({});
  const [memberName, setMemberName] = useState<string | null>(null);

  useEffect(() => {
    let authRequest = 0;
    const unsub = onAuthStateChanged(auth, async (u) => {
      const request = ++authRequest;
      setUser(u);
      setLoading(true);
      setRoles(NO_ROLES);
      setTeamMemberships({});
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
          if (request !== authRequest) return;
          const retreatAdmin = retreatAdminSnap.val();
          const iguardMember = iguardMemberSnap.val();

          const nameSource = [retreatAdmin, iguardMember].find(
            (value) => value && typeof value === "object" && typeof value.name === "string",
          );
          if (nameSource) setMemberName(nameSource.name.trim() || null);

          // 두 축 역할은 그 사람이 속한 노드(retreatAdmins 또는 iguardMembers) 아래에 있다.
          const roleSource = (retreatAdmin && typeof retreatAdmin === "object" ? retreatAdmin : null)
            ?? (iguardMember && typeof iguardMember === "object" ? iguardMember : null);

          setRoles(resolveMinistryRoles({
            isMainAdmin,
            hasRetreatAdmin: retreatAdmin != null,
            retreatAdminRole: retreatAdmin && typeof retreatAdmin === "object" ? retreatAdmin.role : undefined,
            hasIguardMember: iguardMember != null,
            iguardRole: iguardRoleSnap.val(),
            semesterRole: roleSource?.semesterRole,
            retreatRole: roleSource?.retreatRole,
          }));
          // 같은 사람이 두 운영 계정 목록에 함께 있을 수 있다. 한쪽만 고르면 다른 쪽에
          // 연결된 팀이 사라져 보이므로 두 목록의 팀 연결을 합쳐 읽는다.
          setTeamMemberships(mergeTeamMemberships(
            iguardMember?.teamMemberships,
            retreatAdmin?.teamMemberships,
          ));
        } catch {
          if (request !== authRequest) return;
          setRoles(NO_ROLES);
          setTeamMemberships({});
          setMemberName(null);
        }
      }
      setLoading(false);
    });
    return () => {
      authRequest += 1;
      unsub();
    };
  }, []);

  async function signIn() {
    await signInWithPopup(auth, googleProvider);
  }

  async function signOut() {
    await firebaseSignOut(auth);
    setRoles(NO_ROLES);
    setTeamMemberships({});
    setMemberName(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, roles, teamMemberships, memberName, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
