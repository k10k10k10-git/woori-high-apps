"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, onAuthStateChanged, signOut as firebaseSignOut, signInWithPopup } from "firebase/auth";
import { get, ref } from "firebase/database";
import { auth, googleProvider, db } from "@/lib/firebase";
import { paths } from "@/lib/paths";
import { resolveMinistryRole, type MinistryRole } from "@/features/portal/accessPolicy";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  /** 6단계 역할 — 화면 게이트는 accessPolicy의 판정 함수를 통해서만 쓴다 */
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
          const [retreatAdminSnap, iguardMemberSnap, iguardRoleSnap] = await Promise.all([
            get(ref(db, paths.retreatAdmin(u.uid))),
            get(ref(db, paths.iguardMember(u.uid))),
            get(ref(db, paths.iguardRole(u.uid))),
          ]);
          const retreatAdmin = retreatAdminSnap.val();
          const iguardMember = iguardMemberSnap.val();
          const isMainAdmin = await canReadAsMainAdmin(u.uid);

          const nameSource = [retreatAdmin, iguardMember].find(
            (value) => value && typeof value === "object" && typeof value.name === "string",
          );
          if (nameSource) setMemberName(nameSource.name.trim() || null);

          setRole(resolveMinistryRole({
            isMainAdmin,
            hasRetreatAdmin: retreatAdmin != null,
            retreatAdminRole: retreatAdmin && typeof retreatAdmin === "object" ? retreatAdmin.role : undefined,
            hasIguardMember: iguardMember != null,
            iguardRole: iguardRoleSnap.val(),
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
