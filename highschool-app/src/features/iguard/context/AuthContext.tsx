"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, onAuthStateChanged, signOut as firebaseSignOut, signInWithPopup } from "firebase/auth";
import { get, ref } from "firebase/database";
import { auth, googleProvider, db } from "@/features/iguard/lib/firebase";
import { paths } from "@/features/iguard/lib/paths";

// none=권한없음, staff=실행탭만, team=이가드팀(전체 편집), admin=관리자(권한부여)
export type AccessLevel = "none" | "staff" | "team" | "admin";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  accessLevel: AccessLevel;
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
  const [accessLevel, setAccessLevel] = useState<AccessLevel>("none");
  const [memberName, setMemberName] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setMemberName(null);
      if (u) {
        try {
          // 이가드 관리자 = 시스템 최상위 admins (팀원 승인·권한부여)
          // 행정팀(retreatAdmins) = 이가드팀(전체 편집), iguardMembers = 이가드팀/스탭
          const [retreatAdminSnap, memberSnap, roleSnap] = await Promise.all([
            get(ref(db, paths.retreatAdmins(u.uid))),
            get(ref(db, paths.iguardMember(u.uid))),
            get(ref(db, paths.iguardRole(u.uid))),
          ]);
          const isMainAdmin = await canReadAsMainAdmin(u.uid);
          const memberValue = memberSnap.val();
          if (memberValue && typeof memberValue === "object" && typeof memberValue.name === "string") {
            setMemberName(memberValue.name.trim() || null);
          }

          if (isMainAdmin) setAccessLevel("admin");
          else if (retreatAdminSnap.val() != null) setAccessLevel("team");           // 행정팀 = 이가드팀
          else if (memberSnap.val() != null) setAccessLevel(roleSnap.val() === "staff" ? "staff" : "team");
          else setAccessLevel("none");
        } catch {
          setAccessLevel("none");
          setMemberName(null);
        }
      } else {
        setAccessLevel("none");
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
    setAccessLevel("none");
    setMemberName(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, accessLevel, memberName, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
