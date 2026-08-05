"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, onAuthStateChanged, signOut as firebaseSignOut, signInWithPopup } from "firebase/auth";
import { get, ref } from "firebase/database";
import { auth, googleProvider, db } from "@/features/iguard/lib/firebase";
import { paths } from "@/features/iguard/lib/paths";
import { resolveMinistryRole, type MinistryRole } from "@/features/portal/accessPolicy";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  /** 통합 6단계 역할 — 현장 탭 범위는 accessPolicy.iguardScope로만 판정한다 */
  role: MinistryRole;
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
  const [role, setRole] = useState<MinistryRole>("none");
  const [memberName, setMemberName] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setMemberName(null);
      if (u) {
        try {
          // 역할 판정은 통합 accessPolicy가 단일 원천이다 — 행정 화면과 현장 화면이 같은 결론을 내야 한다.
          const [retreatAdminSnap, memberSnap, roleSnap] = await Promise.all([
            get(ref(db, paths.retreatAdmins(u.uid))),
            get(ref(db, paths.iguardMember(u.uid))),
            get(ref(db, paths.iguardRole(u.uid))),
          ]);
          const isMainAdmin = await canReadAsMainAdmin(u.uid);
          const retreatAdmin = retreatAdminSnap.val();
          const memberValue = memberSnap.val();

          const nameSource = [retreatAdmin, memberValue].find(
            (value) => value && typeof value === "object" && typeof value.name === "string",
          );
          if (nameSource) setMemberName(nameSource.name.trim() || null);

          setRole(resolveMinistryRole({
            isMainAdmin,
            hasRetreatAdmin: retreatAdmin != null,
            retreatAdminRole: retreatAdmin && typeof retreatAdmin === "object" ? retreatAdmin.role : undefined,
            hasIguardMember: memberValue != null,
            iguardRole: roleSnap.val(),
          }));
        } catch {
          setRole("none");
          setMemberName(null);
        }
      } else {
        setRole("none");
        setMemberName(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  async function signIn() {
    await signInWithPopup(auth, googleProvider);
  }

  async function signOut() {
    await firebaseSignOut(auth);
    setRole("none");
    setMemberName(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, role, memberName, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
