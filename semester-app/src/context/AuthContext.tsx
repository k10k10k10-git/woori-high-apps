"use client";

// retreat-app AuthContext와 동일 패턴 — 멤버 허용목록은 retreatAdmins 재사용(같은 행정팀).

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, onAuthStateChanged, signOut as firebaseSignOut, signInWithPopup } from "firebase/auth";
import { get, ref } from "firebase/database";
import { auth, googleProvider, db } from "@/lib/firebase";
import { paths } from "@/lib/paths";

export type AccessLevel = "none" | "member" | "admin";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  accessLevel: AccessLevel;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function isMainAdmin(uid: string): Promise<boolean> {
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

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        try {
          const memberSnap = await get(ref(db, paths.retreatAdmin(u.uid)));
          const isMember = memberSnap.val() != null;
          if (await isMainAdmin(u.uid)) setAccessLevel("admin");
          else if (isMember) setAccessLevel("member");
          else setAccessLevel("none");
        } catch {
          setAccessLevel("none");
        }
      } else {
        setAccessLevel("none");
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
  }

  return (
    <AuthContext.Provider value={{ user, loading, accessLevel, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
