"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, onAuthStateChanged, signOut as firebaseSignOut, signInWithPopup } from "firebase/auth";
import { get, ref } from "firebase/database";
import { auth, googleProvider, db } from "@/lib/firebase";
import { paths } from "@/lib/paths";

export type AccessLevel = "none" | "member" | "admin";
export type IguardAccessLevel = "none" | "staff" | "team" | "admin";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  accessLevel: AccessLevel;
  iguardAccessLevel: IguardAccessLevel;
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
  const [iguardAccessLevel, setIguardAccessLevel] = useState<IguardAccessLevel>("none");
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
          const isMember = retreatAdminSnap.val() != null;
          const isMainAdmin = await canReadAsMainAdmin(u.uid);
          const iguardMember = iguardMemberSnap.val();

          if (iguardMember && typeof iguardMember === "object" && typeof iguardMember.name === "string") {
            setMemberName(iguardMember.name.trim() || null);
          }

          if (isMainAdmin) setAccessLevel("admin");
          else if (isMember) setAccessLevel("member");
          else setAccessLevel("none");

          if (isMainAdmin) setIguardAccessLevel("admin");
          else if (isMember) setIguardAccessLevel("team");
          else if (iguardMember != null) {
            setIguardAccessLevel(iguardRoleSnap.val() === "staff" ? "staff" : "team");
          } else setIguardAccessLevel("none");
        } catch {
          setAccessLevel("none");
          setIguardAccessLevel("none");
          setMemberName(null);
        }
      } else {
        setAccessLevel("none");
        setIguardAccessLevel("none");
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
    setIguardAccessLevel("none");
    setMemberName(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, accessLevel, iguardAccessLevel, memberName, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
